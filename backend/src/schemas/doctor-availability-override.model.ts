import { Schema } from 'mongoose';
import { AvailabilityOverrideType } from '../libs/enum/appointment.enum.js';
import { MEMBER } from './member.model.js';

export const DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME = 'DoctorAvailabilityOverride';

const DoctorAvailabilityOverrideSchema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: MEMBER, required: true },
    clinicId: { type: Schema.Types.ObjectId, ref: MEMBER, required: true },
    // Calendar date in the clinic timezone, for example 2026-09-13.
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    type: { type: String, enum: Object.values(AvailabilityOverrideType), required: true },
    // Custom hours are optional only for a full-day UNAVAILABLE override.
    startMinute: { type: Number, min: 0, max: 1_410 },
    endMinute: { type: Number, min: 30, max: 1_440 },
  },
  { timestamps: true, collection: 'doctor_availability_overrides' },
);

DoctorAvailabilityOverrideSchema.pre('validate', function validateCustomHours() {
  const startMinute = this.startMinute;
  const endMinute = this.endMinute;
  if (
    this.type === AvailabilityOverrideType.CUSTOM_HOURS &&
    (startMinute == null ||
      endMinute == null ||
      startMinute % 30 !== 0 ||
      endMinute % 30 !== 0 ||
      endMinute <= startMinute)
  ) {
    this.invalidate('endMinute', 'Custom hours must be a positive interval aligned to 30-minute slots.');
  }
});

DoctorAvailabilityOverrideSchema.index({ doctorId: 1, date: 1, startMinute: 1 }, { unique: true });
DoctorAvailabilityOverrideSchema.index({ clinicId: 1, date: 1 });

export default DoctorAvailabilityOverrideSchema;
