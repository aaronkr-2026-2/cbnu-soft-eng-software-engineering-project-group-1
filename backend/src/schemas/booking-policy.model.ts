import { Schema } from 'mongoose';

export const BOOKING_POLICY = 'BookingPolicy';
export const BOOKING_POLICY_ID = 'booking-v2';
export const BOOKING_MIGRATION_VERSION = 1;
export const BookingPolicySchema = new Schema(
  {
    _id: { type: String, required: true },
    migrationVersion: { type: Number, required: true },
    state: { type: String, enum: ['READY'], required: true },
    migratedAt: { type: Date, required: true },
  },
  { collection: 'booking_policy' },
);
