import { Schema } from 'mongoose';
import {
  AppointmentEventType,
  AppointmentStatus,
  SlotReleaseMode,
} from '../libs/enum/appointment.enum.js';

export const APPOINTMENT_EVENT = 'AppointmentEvent';

// Durable outbox and promotion claims. Notification delivery remains separate; no TTL.
export const AppointmentEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    type: {
      type: String,
      enum: Object.values(AppointmentEventType),
      required: true,
    },
    appointmentId: { type: Schema.Types.ObjectId, required: true },
    appointmentVersion: { type: String, required: true },
    appointmentStatus: {
      type: String,
      enum: Object.values(AppointmentStatus),
      required: true,
    },
    patientId: { type: Schema.Types.ObjectId, required: true },
    clinicId: { type: Schema.Types.ObjectId, required: true },
    doctorId: { type: Schema.Types.ObjectId, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    specialty: String,
    slotGeneration: Number,
    releaseMode: { type: String, enum: Object.values(SlotReleaseMode) },
    occurredAt: { type: Date, required: true },
    waitlistId: Schema.Types.ObjectId,
    claimToken: String,
    leaseUntil: Date,
    attempts: { type: Number, default: 0 },
    nextAttemptAt: Date,
    lastFailureCode: String,
    processedAt: Date,
    result: String,
    state: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'PROCESSED', 'DEFERRED'],
      default: 'PENDING',
      required: true,
    },
  },
  { collection: 'appointment_events' },
);

AppointmentEventSchema.index({ state: 1, occurredAt: 1 });
AppointmentEventSchema.index({
  type: 1,
  state: 1,
  nextAttemptAt: 1,
  leaseUntil: 1,
});
