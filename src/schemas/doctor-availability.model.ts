import { Schema } from 'mongoose';
import { MEMBER } from './member.model.js';

export const DOCTOR_AVAILABILITY_MODEL_NAME = 'DoctorAvailability';

const DoctorAvailabilitySchema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: MEMBER, required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: MEMBER, required: true },
    // 0 (Sunday) through 6 (Saturday), based on the clinic's timezone.
    weekday: { type: Number, required: true, min: 0, max: 6 },
    // Minutes since local midnight. Schedules may contain multiple intervals a day.
    startMinute: { type: Number, required: true, min: 0, max: 1_410 },
    endMinute: { type: Number, required: true, min: 30, max: 1_440 },
  },
  { timestamps: true, collection: 'doctor_availability' },
);

DoctorAvailabilitySchema.pre('validate', function validateThirtyMinuteInterval() {
  if (
    this.startMinute % 30 !== 0 ||
    this.endMinute % 30 !== 0 ||
    this.endMinute <= this.startMinute
  ) {
    this.invalidate('endMinute', 'Availability must be a positive interval aligned to 30-minute slots.');
  }
});

DoctorAvailabilitySchema.index({ doctorId: 1, weekday: 1, startMinute: 1 }, { unique: true });
DoctorAvailabilitySchema.index({ clinicId: 1, weekday: 1 });

export default DoctorAvailabilitySchema;
