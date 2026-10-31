import type { ClientSession, Types, InferSchemaType } from 'mongoose';
import type { WaitlistSchema } from '../../schemas/waitlist.model.js';
import type { DoctorSpecialization } from '../enum/member.enum.js';

// Declare exact UTC starts. Recheck doctor/clinic eligibility and clinic-local
// alignment inside the transaction before reserving a commitment.
export type BookingSlot = { doctorId: Types.ObjectId; startsAt: Date };
export type BookingScope = {
  doctorIds?: Types.ObjectId[];
  patientIds: Types.ObjectId[];
  slots: BookingSlot[];
};
export type BookingCommitment = BookingSlot & {
  kind: 'APPOINTMENT' | 'WAITLIST';
  commitmentId: Types.ObjectId;
  patientId: Types.ObjectId;
  clinicId: Types.ObjectId;
  specialty: DoctorSpecialization;
  endsAt: Date;
  version?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'NOTIFICATION_ONLY';
};

export type BookingTransaction = {
  session: ClientSession;
  reserve: (
    commitment: BookingCommitment,
    allocationGeneration?: number,
  ) => Promise<void>;
  release: (
    kind: BookingCommitment['kind'],
    id: Types.ObjectId,
  ) => Promise<void>;
  holdSlot: (slot: BookingSlot) => Promise<number>;
  resolveSlot: (slot: BookingSlot, generation: number) => Promise<void>;
  slotState: (
    slot: BookingSlot,
  ) => Promise<{ allocationPending: boolean; generation: number }>;
  nextQueueSequence: (slot: BookingSlot) => Promise<number>;
};

export type BookingTarget = Omit<
  BookingCommitment,
  'kind' | 'commitmentId' | 'patientId' | 'version' | 'status'
>;
export type WaitlistRecord = InferSchemaType<typeof WaitlistSchema> & {
  _id: Types.ObjectId;
};
