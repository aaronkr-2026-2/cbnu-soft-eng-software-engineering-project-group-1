import {
  ConflictException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { BookingConflictException } from './booking-error.js';
import {
  Connection,
  type ClientSession,
  type InferSchemaType,
  type Model,
} from 'mongoose';
import {
  BOOKING_GATE,
  BookingGateSchema,
} from '../../schemas/booking-gate.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../../schemas/booking-commitment.model.js';
import type {
  BookingCommitment,
  BookingScope,
  BookingSlot,
  BookingTransaction,
} from '../../libs/types/booking.types.js';

type Gate = InferSchemaType<typeof BookingGateSchema>;
type Commitment = InferSchemaType<typeof BookingCommitmentSchema>;
const DAY_MS = 24 * 60 * 60 * 1000;
const patientKey = (id: { toHexString(): string }) =>
  `patient:${id.toHexString()}`;
const slotKey = (slot: BookingSlot) =>
  `slot:${slot.doctorId.toHexString()}:${slot.startsAt.getTime()}`;

@Injectable()
export class BookingCoordinationService {
  private initialization?: Promise<void>;

  constructor(
    @Optional() @InjectConnection() private readonly connection?: Connection,
    @Optional() @InjectModel(BOOKING_GATE) private readonly gates?: Model<Gate>,
    @Optional()
    @InjectModel(BOOKING_COMMITMENT)
    private readonly commitments?: Model<Commitment>,
  ) {}

  async prepare(): Promise<void> {
    const { connection, gates, commitments } = this;
    if (
      !connection?.db ||
      !gates ||
      !commitments ||
      connection.readyState !== 1
    ) {
      throw new ServiceUnavailableException(
        'Booking coordination is unavailable',
      );
    }
    const hello = await connection.db.admin().command({ hello: 1 });
    if (!hello.setName || hello.logicalSessionTimeoutMinutes == null) {
      throw new ServiceUnavailableException(
        'Booking coordination requires a MongoDB replica set',
      );
    }
    // Explicit index installation also works when the connection has autoIndex=false.
    this.initialization ??= (async () => {
      await gates.createCollection();
      await commitments.createCollection();
      await commitments.createIndexes();
    })().catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    await this.initialization;
  }

  async run<T>(
    scope: BookingScope,
    work: (tx: BookingTransaction) => Promise<T>,
  ): Promise<T> {
    await this.prepare();
    const connection = this.connection!;
    const gates = this.gates!;
    const commitments = this.commitments!;
    const keys = [
      ...new Set([
        ...(scope.doctorIds ?? []).map((id) => `doctor:${id.toHexString()}`),
        ...scope.patientIds.map(patientKey),
        ...scope.slots.map(slotKey),
      ]),
    ].sort();
    if (!keys.length)
      throw new Error('Booking transaction requires coordination keys');
    // Seed before opening the transaction to avoid concurrent first-use upsert
    // duplicate-key errors. These rows have no business meaning without a txn.
    for (const _id of keys) {
      try {
        await gates.updateOne(
          { _id },
          {
            $setOnInsert: {
              revision: 0,
              generation: 0,
              allocationPending: false,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if (!(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000
        ))
          throw error;
      }
    }
    const session = await connection.startSession();
    let attempts = 0;
    try {
      return await session.withTransaction(
        async () => {
          if (++attempts > 8)
            throw new ServiceUnavailableException(
              'Booking coordination is busy; retry after checking current state',
            );
          for (const _id of keys) {
            const gate = await gates
              .findOneAndUpdate(
                { _id },
                { $inc: { revision: 1 } },
                { session, returnDocument: 'after' },
              )
              .lean()
              .exec();
            if (!gate)
              throw new ServiceUnavailableException(
                'Booking coordination gate is missing',
              );
          }
          const requireKey = (key: string) => {
            if (!keys.includes(key))
              throw new Error('Booking operation is outside its locked scope');
          };
          return work({
            session,
            reserve: async (entry, generation) => {
              requireKey(patientKey(entry.patientId));
              requireKey(slotKey(entry));
              await this.reserve(
                entry,
                generation,
                session,
                gates,
                commitments,
              );
            },
            release: async (kind, commitmentId) => {
              const entry = await commitments
                .findOne({ kind, commitmentId })
                .session(session)
                .lean()
                .exec();
              if (!entry)
                throw new ConflictException('Commitment no longer exists');
              requireKey(patientKey(entry.patientId));
              requireKey(slotKey(entry));
              await commitments.deleteOne({ _id: entry._id }, { session });
            },
            holdSlot: async (slot) => {
              const _id = slotKey(slot);
              requireKey(_id);
              const gate = await gates
                .findOneAndUpdate(
                  { _id },
                  {
                    $inc: { generation: 1 },
                    $set: { allocationPending: true },
                  },
                  { session, returnDocument: 'after' },
                )
                .lean()
                .exec();
              if (!gate)
                throw new ServiceUnavailableException(
                  'Booking coordination gate is missing',
                );
              return gate.generation;
            },
            resolveSlot: async (slot, generation) => {
              const _id = slotKey(slot);
              requireKey(_id);
              const result = await gates.updateOne(
                { _id, generation, allocationPending: true },
                { $set: { allocationPending: false } },
                { session },
              );
              if (result.matchedCount !== 1)
                throw new ConflictException('Slot generation is stale');
            },
          });
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          maxCommitTimeMS: 5_000,
          timeoutMS: 10_000,
        },
      );
    } finally {
      await session.endSession();
    }
  }

  private async reserve(
    entry: BookingCommitment,
    generation: number | undefined,
    session: ClientSession,
    gates: Model<Gate>,
    commitments: Model<Commitment>,
  ) {
    const gate = await gates
      .findById(slotKey(entry))
      .session(session)
      .lean()
      .exec();
    if (
      !gate ||
      (generation == null
        ? gate.allocationPending
        : !gate.allocationPending || gate.generation !== generation)
    ) {
      throw new BookingConflictException('STALE_COMMITMENT');
    }
    const duplicate = await commitments
      .exists({ kind: entry.kind, commitmentId: entry.commitmentId })
      .session(session);
    if (duplicate) throw new BookingConflictException('DUPLICATE_ENTRY');
    const sameSpecialty = {
      clinicId: entry.clinicId,
      specialty: entry.specialty,
      startsAt: {
        $gt: new Date(entry.startsAt.getTime() - DAY_MS),
        $lt: new Date(entry.startsAt.getTime() + DAY_MS),
      },
    };
    const blockers = await commitments
      .find({
        patientId: entry.patientId,
        $or: [
          sameSpecialty,
          ...(entry.kind === 'APPOINTMENT'
            ? [
                {
                  kind: 'APPOINTMENT' as const,
                  startsAt: { $lt: entry.endsAt },
                  endsAt: { $gt: entry.startsAt },
                },
              ]
            : []),
        ],
      })
      .session(session)
      .sort({ startsAt: 1, commitmentId: 1 })
      .lean()
      .exec();
    if (blockers.length) {
      const specialtyConflict = blockers.some(
        (item) =>
          String(item.clinicId) === String(entry.clinicId) &&
          item.specialty === entry.specialty &&
          Math.abs(item.startsAt.getTime() - entry.startsAt.getTime()) < DAY_MS,
      );
      throw new BookingConflictException(
        specialtyConflict ? 'COMMITMENT_CONFLICT' : 'PATIENT_OVERLAP',
        blockers,
      );
    }
    if (entry.kind === 'APPOINTMENT') {
      const occupied = await commitments
        .exists({
          doctorId: entry.doctorId,
          kind: 'APPOINTMENT',
          startsAt: { $lt: entry.endsAt },
          endsAt: { $gt: entry.startsAt },
        })
        .session(session);
      if (occupied) throw new BookingConflictException('SLOT_OCCUPIED');
    }
    await commitments.create([entry], { session });
    // A new manual allocation makes earlier opening events stale. Allocators
    // using an explicit generation retain it until resolveSlot completes.
    if (entry.kind === 'APPOINTMENT' && generation == null) {
      await gates.updateOne(
        { _id: slotKey(entry) },
        { $inc: { generation: 1 } },
        { session },
      );
    }
  }
}
