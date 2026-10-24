import type { ClientSession, Types } from 'mongoose';
import type { DoctorSpecialization } from '../enum/member.enum.js';

// Callers validate doctor/clinic eligibility and normalize slots through
// appointmentSlot using the clinic timezone before declaring this scope.
export type BookingSlot = { doctorId: Types.ObjectId; startsAt: Date };
export type BookingScope = {
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
};
