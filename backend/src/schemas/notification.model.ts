import { Schema } from 'mongoose';
export const NOTIFICATION = 'Notification';
export const NOTIFICATION_OUTBOX = 'NotificationOutbox';
export const noticeFields = {
  _id: { type: String, required: true },
  patientId: { type: Schema.Types.ObjectId, required: true },
  waitlistId: { type: Schema.Types.ObjectId, required: true },
  type: {
    type: String,
    enum: [
      'WAITLIST_JOINED',
      'WAITLIST_BOOKING_CREATED',
      'SLOT_OPEN_FOR_MANUAL_BOOKING',
      'WAITLIST_EXPIRED',
    ],
    required: true,
  },
  doctorId: { type: Schema.Types.ObjectId, required: true },
  clinicId: { type: Schema.Types.ObjectId, required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  appointmentId: Schema.Types.ObjectId,
  occurredAt: { type: Date, required: true },
};
export const NotificationSchema = new Schema(
  { ...noticeFields, readAt: Date },
  { collection: 'notifications', timestamps: true },
);
NotificationSchema.index({ patientId: 1, occurredAt: -1, _id: -1 });
export const NotificationOutboxSchema = new Schema(
  {
    ...noticeFields,
    eventId: { type: String, required: true },
    channel: {
      type: String,
      enum: ['IN_APP'],
      default: 'IN_APP',
      required: true,
    },
    state: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'DELIVERED'],
      default: 'PENDING',
      required: true,
    },
    attempts: { type: Number, default: 0 },
    claimToken: String,
    leaseUntil: Date,
    nextAttemptAt: Date,
    lastFailureCode: String,
    deliveredAt: Date,
  },
  { collection: 'notification_outbox' },
);
NotificationOutboxSchema.index(
  { eventId: 1, patientId: 1, channel: 1 },
  { unique: true },
);
NotificationOutboxSchema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
