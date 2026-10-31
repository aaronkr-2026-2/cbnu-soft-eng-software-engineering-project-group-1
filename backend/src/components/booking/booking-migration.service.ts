import { ACTIVE_WAITLIST_STATUSES } from '../../schemas/waitlist.model.js';
import { WaitlistStatus } from '../../libs/enum/appointment.enum.js';
import { DoctorSpecialization } from '../../libs/enum/member.enum.js';
import type { BookingCommitment } from '../../libs/types/booking.types.js';
import { Injectable, Optional } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  Connection,
  Types,
  type ClientSession,
  type InferSchemaType,
  type Model,
} from 'mongoose';
import { randomUUID } from 'node:crypto';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../../schemas/appointment.model.js';
import { MEMBER } from '../../schemas/member.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../../schemas/booking-commitment.model.js';
import {
  BOOKING_POLICY,
  BOOKING_POLICY_ID,
  BOOKING_MIGRATION_VERSION,
  BookingPolicySchema,
} from '../../schemas/booking-policy.model.js';
import type { MemberEntity } from '../../libs/types/member.types.js';
import { BookingCoordinationService } from './booking-coordination.service.js';
import { bookingPolicyEnabled } from './booking.config.js';
import {
  planBookingMigration,
  type BookingResolution,
  type LegacyAppointment,
} from './booking-migration.js';

@Injectable()
export class BookingMigrationService {
  constructor(
    private readonly coordination: BookingCoordinationService,
    @Optional() @InjectConnection() private readonly connection?: Connection,
    @Optional()
    @InjectModel(APPOINTMENT_MODEL_NAME)
    private readonly appointments?: Model<
      InferSchemaType<typeof AppointmentSchema>
    >,
    @Optional()
    @InjectModel(MEMBER)
    private readonly members?: Model<MemberEntity>,
    @Optional()
    @InjectModel(BOOKING_COMMITMENT)
    private readonly commitments?: Model<
      InferSchemaType<typeof BookingCommitmentSchema>
    >,
    @Optional()
    @InjectModel(BOOKING_POLICY)
    private readonly policy?: Model<
      InferSchemaType<typeof BookingPolicySchema>
    >,
  ) {}

  async audit(
    resolutions: BookingResolution[] = [],
    session?: ClientSession,
    includeWaitlists = false,
  ) {
    if (!this.connection?.db || !this.members || !this.commitments)
      throw new Error('Migration persistence is unavailable');
    const rows = await this.connection.db
      .collection<LegacyAppointment>('appointments')
      .find({}, { session })
      .limit(5001)
      .toArray();
    if (rows.length > 5000)
      throw new Error(
        'Migration exceeds the 5000-record rehearsal limit; use a separately reviewed batch migration',
      );
    const participantIds = rows
      .flatMap((row) => [row.patientId, row.doctorId, row.clinicId])
      .filter(
        (value): value is Types.ObjectId => value instanceof Types.ObjectId,
      );
    const participants = await this.members
      .find({ _id: { $in: participantIds } })
      .session(session ?? null)
      .lean()
      .exec();
    const plan = planBookingMigration(rows, participants, resolutions);
    const ledger = await this.commitments
      .find({})
      .session(session ?? null)
      .lean()
      .exec();
    const queues = await this.connection.db
      .collection('waitlists')
      .find({}, { session })
      .limit(5001)
      .toArray();
    if (queues.length > 5000)
      throw new Error('Waitlist audit exceeds the 5000-record limit');
    const expected: BookingCommitment[] = [...plan.commitments];
    if (
      !includeWaitlists &&
      (queues.length || ledger.some((entry) => entry.kind === 'WAITLIST'))
    )
      plan.issues.push({ code: 'WAITLIST_PRESENT' });
    if (includeWaitlists) {
      const sequences = new Set<string>();
      for (const row of queues) {
        if (
          !Object.values(WaitlistStatus).includes(row.status as WaitlistStatus)
        ) {
          plan.issues.push({ code: 'INVALID_WAITLIST' });
          continue;
        }
        if (!ACTIVE_WAITLIST_STATUSES.includes(row.status as WaitlistStatus))
          continue;
        const valid =
          ['patientId', 'doctorId', 'clinicId'].every(
            (key) => row[key] instanceof Types.ObjectId,
          ) &&
          row.startsAt instanceof Date &&
          Number.isFinite(+row.startsAt) &&
          row.endsAt instanceof Date &&
          +row.endsAt - +row.startsAt === 1800000 &&
          Object.values(DoctorSpecialization).includes(
            row.specialty as DoctorSpecialization,
          ) &&
          row.automaticBookingConsent === true &&
          row.consentedAt instanceof Date &&
          Number.isFinite(+row.consentedAt) &&
          row.consentPolicyVersion === 'waitlist-v1' &&
          typeof row.version === 'string' &&
          /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(row.version) &&
          Number.isSafeInteger(row.queueSequence) &&
          row.queueSequence > 0;
        if (!valid) {
          plan.issues.push({ code: 'INVALID_WAITLIST' });
          continue;
        }
        const sequenceKey = `${row.doctorId}:${+row.startsAt}:${row.queueSequence}`;
        if (sequences.has(sequenceKey))
          plan.issues.push({ code: 'DUPLICATE_QUEUE_SEQUENCE' });
        sequences.add(sequenceKey);
        const gate = await this.connection.db
          .collection<{ _id: string; queueSequence: number }>('booking_gates')
          .findOne(
            { _id: `slot:${row.doctorId}:${+row.startsAt}` },
            {
              session,
            },
          );
        if (
          !gate ||
          !Number.isSafeInteger(gate.queueSequence) ||
          gate.queueSequence < row.queueSequence
        )
          plan.issues.push({ code: 'INVALID_QUEUE_SEQUENCE' });
        expected.push({
          kind: 'WAITLIST',
          commitmentId: row._id,
          patientId: row.patientId,
          doctorId: row.doctorId,
          clinicId: row.clinicId,
          specialty: row.specialty,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          version: row.version,
          status: row.status,
        } as BookingCommitment);
      }
      for (let i = 0; i < expected.length; i++)
        for (let j = i + 1; j < expected.length; j++) {
          const a = expected[i],
            b = expected[j];
          if (
            String(a.patientId) === String(b.patientId) &&
            String(a.clinicId) === String(b.clinicId) &&
            a.specialty === b.specialty &&
            Math.abs(+a.startsAt - +b.startsAt) < 86400000
          )
            plan.issues.push({ code: 'COMMITMENT_CONFLICT' });
        }
    }
    const byId = new Map(
      ledger.map((entry) => [`${entry.kind}:${entry.commitmentId}`, entry]),
    );
    const ledgerMatches =
      ledger.length === expected.length &&
      expected.every((entry) => {
        const recorded = byId.get(`${entry.kind}:${entry.commitmentId}`);
        return (
          recorded &&
          [
            'patientId',
            'doctorId',
            'clinicId',
            'specialty',
            'version',
            'status',
          ].every(
            (key) =>
              String(recorded[key as keyof typeof recorded]) ===
              String(entry[key as keyof typeof entry]),
          ) &&
          recorded.startsAt.getTime() === entry.startsAt.getTime() &&
          recorded.endsAt.getTime() === entry.endsAt.getTime()
        );
      });
    const metadataMatches = rows.every(
      (row) =>
        typeof row.version === 'string' && typeof row.source === 'string',
    );
    const issueCounts: Record<string, number> = {};
    for (const issue of plan.issues)
      issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
    return {
      ...plan,
      ledgerMatches,
      metadataMatches,
      summary: {
        total: rows.length,
        active: plan.commitments.length,
        issueCounts,
        readyToApply: plan.issues.length === 0,
        ledgerMatches,
        metadataMatches,
      },
    };
  }

  async auditSnapshot() {
    if (!this.connection)
      throw new Error('Migration persistence is unavailable');
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(
        () => this.audit([], session, true),
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 10_000,
          maxCommitTimeMS: 5_000,
        },
      );
    } finally {
      await session.endSession();
    }
  }

  // Offline maintenance operation only; stop ALL old/new API and worker writers
  // before calling. No public route exposes migration, and no status is inferred.
  async apply(resolutions: BookingResolution[] = []) {
    if (bookingPolicyEnabled())
      throw new Error(
        'Disable BOOKING_POLICY_V2_ENABLED and stop all writers before applying migration',
      );
    if (
      !this.connection?.db ||
      !this.appointments ||
      !this.commitments ||
      !this.policy
    )
      throw new Error('Migration persistence is unavailable');
    await this.coordination.prepare();
    await this.appointments.createCollection();
    await this.appointments.createIndexes();
    await this.policy.createCollection();
    await this.connection.db.createCollection('booking_migration_audit');
    const session = await this.connection.startSession();
    let attempts = 0;
    try {
      return await session.withTransaction(
        async () => {
          if (++attempts > 8) throw new Error('Migration retry limit exceeded');
          const result = await this.audit(resolutions, session);
          if (result.issues.length)
            throw new Error(
              'Migration has unresolved records; inspect a private dry-run report',
            );
          if (
            await this.commitments!.exists({ kind: 'WAITLIST' }).session(
              session,
            )
          )
            throw new Error(
              'Initial migration cannot run with waitlist commitments',
            );
          const now = new Date();
          if (result.updates.length) {
            await this.appointments!.collection.bulkWrite(
              result.updates.map((update) => {
                const { _id, ...fields } = update;
                return {
                  updateOne: { filter: { _id }, update: { $set: fields } },
                };
              }),
              { session },
            );
          }
          if (result.auditChanges.length) {
            const migrationId = randomUUID();
            await this.connection!.db!.collection(
              'booking_migration_audit',
            ).insertMany(
              result.auditChanges.map((change) => ({
                ...change,
                migrationId,
                at: now,
              })),
              { session },
            );
          }
          await this.commitments!.deleteMany(
            { kind: 'APPOINTMENT' },
            { session },
          );
          if (result.commitments.length)
            await this.commitments!.create(result.commitments, {
              session,
              ordered: true,
            });
          await this.policy!.updateOne(
            { _id: BOOKING_POLICY_ID },
            {
              $set: {
                state: 'READY',
                migrationVersion: BOOKING_MIGRATION_VERSION,
                migratedAt: now,
              },
            },
            { session, upsert: true },
          );
          return {
            ...result.summary,
            ledgerMatches: true,
            metadataMatches: true,
          };
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 10_000,
          maxCommitTimeMS: 5_000,
        },
      );
    } finally {
      await session.endSession();
    }
  }
}
