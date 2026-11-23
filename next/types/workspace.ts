export interface CalendarEntry {
  _id: string;
  doctorId: string;
  clinicId: string;
  patientId: string;
  specialty: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  source: string;
  version: string | null;
  clinicTimezone?: string | null;
}
export interface CalendarRange {
  from: string;
  to: string;
  doctorId?: string;
}
export interface CalendarPage {
  entries: CalendarEntry[];
  revision: string;
  nextCursor: string | null;
  clinicTimezone: string | null;
}
export type CalendarSnapshot = Omit<CalendarPage, 'nextCursor'>;
export interface WeeklyInterval {
  weekday: number;
  startMinute: number;
  endMinute: number;
}
export interface DateOverride {
  type: 'CUSTOM_HOURS' | 'UNAVAILABLE';
  startMinute?: number;
  endMinute?: number;
}
export interface StaffBookingInput {
  doctorId: string;
  patientId: string;
  specialty: string;
  startsAt: string;
  source: 'PHONE' | 'WALK_IN';
}
