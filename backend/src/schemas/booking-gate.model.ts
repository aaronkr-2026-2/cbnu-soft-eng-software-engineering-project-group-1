import { Schema } from 'mongoose';

export const BOOKING_GATE = 'BookingGate';

// Durable coordination rows, not expiring application locks. MongoDB holds the
// actual write locks only until the transaction commits/aborts. Never TTL these.
export const BookingGateSchema = new Schema(
  {
    _id: { type: String, required: true },
    revision: { type: Number, required: true, default: 0 },
    generation: { type: Number, required: true, default: 0 },
    allocationPending: { type: Boolean, required: true, default: false },
    queueSequence: { type: Number, required: true, default: 0 },
  },
  { collection: 'booking_gates' },
);
