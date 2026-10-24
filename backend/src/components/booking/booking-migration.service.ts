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

  async audit(resolutions: BookingResolution[] = [], session?: ClientSession) {
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
    if (ledger.some((entry) => entry.kind === 'WAITLIST'))
      plan.issues.push({ code: 'WAITLIST_PRESENT' });
    const byId = new Map(
      ledger.map((entry) => [`${entry.kind}:${entry.commitmentId}`, entry]),
    );
    const ledgerMatches =
      ledger.length === plan.commitments.length &&
      plan.commitments.every((entry) => {
        const recorded = byId.get(`APPOINTMENT:${entry.commitmentId}`);
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
      return await session.withTransaction(() => this.audit([], session), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS: 10_000,
        maxCommitTimeMS: 5_000,
      });
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
