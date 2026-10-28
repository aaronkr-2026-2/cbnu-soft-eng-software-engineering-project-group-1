import { registerEnumType } from '@nestjs/graphql';

export const APPOINTMENT_SLOT_DURATION_MINUTES = 30;
export const APPOINTMENT_SLOT_DURATION_MS =
  APPOINTMENT_SLOT_DURATION_MINUTES * 60 * 1000;

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELED = 'CANCELED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
}
registerEnumType(AppointmentStatus, { name: 'AppointmentStatus' });

export enum AppointmentSource {
  ONLINE = 'ONLINE',
  PHONE = 'PHONE',
  WALK_IN = 'WALK_IN',
  WAITLIST = 'WAITLIST',
  LEGACY = 'LEGACY',
}
registerEnumType(AppointmentSource, { name: 'AppointmentSource' });

export enum DoctorChangeRequestType {
  CANCEL = 'CANCEL',
  RESCHEDULE = 'RESCHEDULE',
}
registerEnumType(DoctorChangeRequestType, { name: 'DoctorChangeRequestType' });

export enum DoctorChangeRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
registerEnumType(DoctorChangeRequestStatus, {
  name: 'DoctorChangeRequestStatus',
});

export enum AvailabilityOverrideType {
  UNAVAILABLE = 'UNAVAILABLE',
  CUSTOM_HOURS = 'CUSTOM_HOURS',
}
registerEnumType(AvailabilityOverrideType, {
  name: 'AvailabilityOverrideType',
});

export enum AppointmentSlotState {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  UNAVAILABLE = 'UNAVAILABLE',
}
registerEnumType(AppointmentSlotState, { name: 'AppointmentSlotState' });
