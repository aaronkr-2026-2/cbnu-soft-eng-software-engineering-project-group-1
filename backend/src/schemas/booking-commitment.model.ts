import { Schema } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DoctorSpecialization } from '../libs/enum/member.enum.js';
import { APPOINTMENT_SLOT_DURATION_MS } from '../libs/enum/appointment.enum.js';

export const BOOKING_COMMITMENT = 'BookingCommitment';

// Active commitments only. Future lifecycle writes must update this ledger in
// the SAME transaction as the appointment/waitlist and any outbox event.
export const BookingCommitmentSchema = new Schema(
  {
    version: { type: String, required: true, default: randomUUID },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'ACTIVE', 'NOTIFICATION_ONLY'],
      default: function (this: { kind?: string }) {
        return this.kind === 'WAITLIST' ? 'ACTIVE' : 'CONFIRMED';
      },
      required: true,
    },
    kind: { type: String, enum: ['APPOINTMENT', 'WAITLIST'], required: true },
    commitmentId: { type: Schema.Types.ObjectId, required: true },
    patientId: { type: Schema.Types.ObjectId, required: true },
    clinicId: { type: Schema.Types.ObjectId, required: true },
    doctorId: { type: Schema.Types.ObjectId, required: true },
    specialty: {
      type: String,
      enum: Object.values(DoctorSpecialization),
      required: true,
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
  },
  { collection: 'booking_commitments', timestamps: true },
);

BookingCommitmentSchema.pre('validate', function () {
  if (
    this.startsAt instanceof Date &&
    this.endsAt instanceof Date &&
    this.endsAt.getTime() - this.startsAt.getTime() !==
      APPOINTMENT_SLOT_DURATION_MS
  ) {
    this.invalidate('endsAt', 'Commitments must last 30 minutes');
  }
});
BookingCommitmentSchema.index({ kind: 1, commitmentId: 1 }, { unique: true });
BookingCommitmentSchema.index({
  patientId: 1,
  clinicId: 1,
  specialty: 1,
  startsAt: 1,
});
BookingCommitmentSchema.index({ patientId: 1, kind: 1, startsAt: 1 });
BookingCommitmentSchema.index(
  { doctorId: 1, startsAt: 1 },
  { unique: true, partialFilterExpression: { kind: 'APPOINTMENT' } },
);
