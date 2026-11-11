import { Schema } from 'mongoose';
import { WaitlistStatus } from '../libs/enum/appointment.enum.js';
import { DoctorSpecialization } from '../libs/enum/member.enum.js';

export const WAITLIST = 'Waitlist';
export const ACTIVE_WAITLIST_STATUSES = [
  WaitlistStatus.ACTIVE,
  WaitlistStatus.NOTIFICATION_ONLY,
];
export const WaitlistSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, required: true },
    doctorId: { type: Schema.Types.ObjectId, required: true },
    clinicId: { type: Schema.Types.ObjectId, required: true },
    specialty: {
      type: String,
      enum: Object.values(DoctorSpecialization),
      required: true,
      immutable: true,
    },
    startsAt: { type: Date, required: true, immutable: true },
    endsAt: { type: Date, required: true, immutable: true },
    status: {
      type: String,
      enum: Object.values(WaitlistStatus),
      required: true,
    },
    automaticBookingConsent: {
      type: Boolean,
      required: true,
      validate: (value: boolean) => value === true,
    },
    consentedAt: { type: Date, required: true },
    consentPolicyVersion: { type: String, required: true },
    queueSequence: { type: Number, required: true, min: 1 },
    version: { type: String, required: true },
    appointmentId: Schema.Types.ObjectId,
    closedReason: { type: String, maxlength: 100 },
  },
  { collection: 'waitlists', timestamps: true },
);
WaitlistSchema.index({ patientId: 1, _id: 1 });
WaitlistSchema.index({ doctorId: 1, startsAt: 1, status: 1, queueSequence: 1 });
WaitlistSchema.index(
  { patientId: 1, doctorId: 1, clinicId: 1, specialty: 1, startsAt: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_WAITLIST_STATUSES } },
  },
);
