import { Schema } from 'mongoose';
export const WAITLIST_CLEANUP = 'WaitlistCleanup';
// One durable high-water mark per physical slot; later enrollments survive old bookings.
export const WaitlistCleanupSchema = new Schema(
  {
    _id: { type: String, required: true },
    doctorId: { type: Schema.Types.ObjectId, required: true },
    startsAt: { type: Date, required: true },
    sequenceMax: { type: Number, required: true },
  },
  { collection: 'waitlist_cleanup' },
);
