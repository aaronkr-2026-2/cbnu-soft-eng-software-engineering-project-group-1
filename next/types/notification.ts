import type { Appointment, Slot, Waitlist } from './booking';
export interface PatientNotification {
  _id: string;
  type: string;
  message: string;
  waitlistId: string;
  doctorId: string;
  clinicId: string;
  appointmentId: string | null;
  startsAt: string;
  endsAt: string;
  occurredAt: string;
  readAt: string | null;
}
export interface NotificationPage {
  entries: PatientNotification[];
  nextCursor: string | null;
  unreadCount: number;
}
export interface NotificationContext {
  notification: PatientNotification;
  targetKind: 'APPOINTMENT' | 'SLOT' | 'WAITLIST' | 'UNAVAILABLE';
  checkedAt: string;
  appointment: Appointment | null;
  slot: Slot | null;
  waitlist: Waitlist | null;
}
