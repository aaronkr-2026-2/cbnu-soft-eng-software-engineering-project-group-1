import { Schema } from 'mongoose';
import {
  APPOINTMENT_SLOT_DURATION_MINUTES,
  APPOINTMENT_SLOT_DURATION_MS,
  AppointmentStatus,
  DoctorChangeRequestStatus,
  DoctorChangeRequestType,
} from '../enum/appointment.enum.js';
import { MEMBER_MODEL_NAME } from './member.model.js';

export const APPOINTMENT_MODEL_NAME = 'Appointment';

const DoctorChangeRequestSchema = new Schema(
  {
    type: { type: String, enum: Object.values(DoctorChangeRequestType), required: true },
    status: {
      type: String,
      enum: Object.values(DoctorChangeRequestStatus),
      default: DoctorChangeRequestStatus.PENDING,
    },
    proposedStartsAt: Date,
    proposedEndsAt: Date,
    reason: { type: String, trim: true, maxlength: 500 },
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: MEMBER_MODEL_NAME },
  },
  { _id: false },
);

const AppointmentSchema = new Schema(
  {
    // Stored in UTC. Convert using the clinic's IANA timezone at the API edge.
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    durationMinutes: {
      type: Number,
      default: APPOINTMENT_SLOT_DURATION_MINUTES,
      immutable: true,
      enum: [APPOINTMENT_SLOT_DURATION_MINUTES],
    },
    status: {
      type: String,
      enum: Object.values(AppointmentStatus),
      default: AppointmentStatus.PENDING,
    },
    doctorId: { type: Schema.Types.ObjectId, ref: MEMBER_MODEL_NAME, required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: MEMBER_MODEL_NAME, required: true },
    patientId: { type: Schema.Types.ObjectId, ref: MEMBER_MODEL_NAME, required: true },
    // Only a clinic may approve/reject this request. The appointment remains
    // unchanged until an approved request is applied by the service.
    doctorChangeRequest: DoctorChangeRequestSchema,
    lastChangedBy: { type: Schema.Types.ObjectId, ref: MEMBER_MODEL_NAME },
    canceledAt: Date,
    canceledBy: { type: Schema.Types.ObjectId, ref: MEMBER_MODEL_NAME },
  },
  { timestamps: true, collection: 'appointments' },
);

AppointmentSchema.pre('validate', function validateDuration() {
  if (
    this.startsAt instanceof Date &&
    this.endsAt instanceof Date &&
    this.endsAt.getTime() - this.startsAt.getTime() !== APPOINTMENT_SLOT_DURATION_MS
  ) {
    this.invalidate('endsAt', `Appointments must be exactly ${APPOINTMENT_SLOT_DURATION_MINUTES} minutes.`);
  }
});

// Only active appointments reserve a doctor slot. Cancellation releases it.
AppointmentSchema.index(
  { doctorId: 1, startsAt: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    },
  },
);
AppointmentSchema.index({ clinicId: 1, startsAt: 1 });
AppointmentSchema.index({ patientId: 1, startsAt: -1 });

export default AppointmentSchema;
