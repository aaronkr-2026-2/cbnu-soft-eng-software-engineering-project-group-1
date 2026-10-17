import { registerEnumType } from '@nestjs/graphql';

export const APPOINTMENT_SLOT_DURATION_MINUTES = 30;
export const APPOINTMENT_SLOT_DURATION_MS = APPOINTMENT_SLOT_DURATION_MINUTES * 60 * 1000;

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELED = 'CANCELED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
}
registerEnumType(AppointmentStatus, { name: 'AppointmentStatus' });

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
registerEnumType(DoctorChangeRequestStatus, { name: 'DoctorChangeRequestStatus' });

export enum AvailabilityOverrideType {
  UNAVAILABLE = 'UNAVAILABLE',
  CUSTOM_HOURS = 'CUSTOM_HOURS',
}
registerEnumType(AvailabilityOverrideType, { name: 'AvailabilityOverrideType' });
