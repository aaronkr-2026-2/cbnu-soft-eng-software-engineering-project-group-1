import * as docs from '../../apollo/user/workspace';
import { BookingError, careRequest } from './booking';
import type { PublicMember } from './public-members';
import type {
  CalendarEntry,
  CalendarPage,
  CalendarRange,
  CalendarSnapshot,
  DateOverride,
  StaffBookingInput,
  WeeklyInterval,
} from '../../types/workspace';
export async function calendarPage(
  input: CalendarRange & { limit?: number; after?: string; revision?: string },
  signal: AbortSignal,
) {
  return (
    await careRequest<{ myCalendar: CalendarPage }>(
      docs.CALENDAR,
      { input },
      signal,
    )
  ).myCalendar;
}
// Buffer all pages and publish one consistent revision. A changed revision
// discards the entire partial read; bounded retries never replay mutations.
export async function calendarSnapshot(
  range: CalendarRange,
  signal: AbortSignal,
): Promise<CalendarSnapshot> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let after: string | undefined,
        revision: string | undefined,
        clinicTimezone: string | null = null;
      const rows = new Map<string, CalendarEntry>(),
        cursors = new Set<string>();
      for (let page = 0; page < 50; page++) {
        signal.throwIfAborted();
        const result = await calendarPage(
          { ...range, limit: 100, ...(after ? { after, revision } : {}) },
          signal,
        );
        if (revision && result.revision !== revision)
          throw new BookingError(
            'Calendar changed during loading.',
            'CONFLICT',
          );
        revision = result.revision;
        clinicTimezone = result.clinicTimezone;
        for (const row of result.entries) rows.set(row._id, row);
        if (!result.nextCursor)
          return {
            entries: [...rows.values()].sort(
              (a, b) =>
                +new Date(a.startsAt) - +new Date(b.startsAt) ||
                a._id.localeCompare(b._id),
            ),
            revision,
            clinicTimezone,
          };
        if (cursors.has(result.nextCursor))
          throw new BookingError(
            'Calendar pagination could not be verified. Narrow the date range.',
          );
        cursors.add(result.nextCursor);
        after = result.nextCursor;
      }
      throw new BookingError(
        'Calendar is too large. Use day view or select a doctor.',
      );
    } catch (error) {
      if (
        signal.aborted ||
        !(error instanceof BookingError) ||
        error.code !== 'CONFLICT' ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new BookingError('Calendar is changing. Refresh to try again.');
}
export async function calendarUpdates(
  range: CalendarRange,
  knownRevision: string,
  signal: AbortSignal,
) {
  return (
    await careRequest<{
      calendarUpdates: {
        revision: string;
        changed: boolean;
        pollAfterSeconds: number;
      };
    }>(docs.CALENDAR_UPDATES, { input: { ...range, knownRevision } }, signal)
  ).calendarUpdates;
}
export async function clinicTeam(signal: AbortSignal) {
  return (
    await careRequest<{ myClinicDoctors: PublicMember[] }>(
      docs.CLINIC_TEAM,
      {},
      signal,
    )
  ).myClinicDoctors;
}
export async function reviewDoctor(
  doctorId: string,
  approve: boolean,
  signal: AbortSignal,
) {
  return (
    await careRequest<{ reviewDoctorAffiliation: string }>(
      docs.REVIEW_DOCTOR,
      { doctorId, approve },
      signal,
      true,
      true,
    )
  ).reviewDoctorAffiliation;
}
export async function setWeeklyHours(
  doctorId: string,
  intervals: WeeklyInterval[],
  signal: AbortSignal,
) {
  return (
    await careRequest<{ setDoctorWeeklyHours: boolean }>(
      docs.WEEKLY_HOURS,
      { input: { doctorId, intervals } },
      signal,
      true,
      true,
    )
  ).setDoctorWeeklyHours;
}
export async function setDateOverrides(
  doctorId: string,
  date: string,
  overrides: DateOverride[],
  signal: AbortSignal,
) {
  return (
    await careRequest<{ setDoctorDateOverrides: boolean }>(
      docs.DATE_OVERRIDES,
      { input: { doctorId, date, overrides } },
      signal,
      true,
      true,
    )
  ).setDoctorDateOverrides;
}
export async function staffBooking(
  input: StaffBookingInput,
  signal: AbortSignal,
) {
  return (
    await careRequest<{ createClinicAppointment: CalendarEntry }>(
      docs.STAFF_BOOKING,
      { input },
      signal,
      true,
      true,
    )
  ).createClinicAppointment;
}
export async function appointmentOutcome(
  id: string,
  outcome: 'COMPLETED' | 'NO_SHOW',
  signal: AbortSignal,
) {
  return (
    await careRequest<{ setAppointmentOutcome: CalendarEntry }>(
      docs.APPOINTMENT_OUTCOME,
      { id, outcome },
      signal,
      true,
      true,
    )
  ).setAppointmentOutcome;
}
