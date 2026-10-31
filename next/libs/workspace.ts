import { calendarDate, shiftDay } from './booking-calendar';
import { dateInZone } from './booking';
import type {
  CalendarEntry,
  CalendarRange,
  DateOverride,
  WeeklyInterval,
} from '../types/workspace';
export const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
// Find the first instant of a clinic-local date, including midnight DST gaps.
// Date comparison avoids treating browser-local midnight as the clinic midnight.
export function clinicMidnight(date: string, zone: string) {
  const parsed = +calendarDate(date);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== date
  )
    throw new Error('Choose a valid date.');
  let low = parsed - 2 * 86400000,
    high = parsed + 2 * 86400000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (dateInZone(new Date(middle), zone) < date) low = middle + 1;
    else high = middle;
  }
  if (dateInZone(new Date(low), zone) !== date)
    throw new Error('This date does not exist in the clinic timezone.');
  return new Date(low).toISOString();
}
export function calendarWindow(
  date: string,
  days: 1 | 7,
  zone: string,
  doctorId?: string,
): CalendarRange {
  return {
    from: clinicMidnight(date, zone),
    to: clinicMidnight(shiftDay(date, days), zone),
    ...(doctorId ? { doctorId } : {}),
  };
}
export function entriesForDay(
  rows: CalendarEntry[],
  date: string,
  zone: string,
) {
  const range = calendarWindow(date, 1, zone);
  return rows.filter(
    (row) =>
      +new Date(row.startsAt) < +new Date(range.to) &&
      +new Date(row.endsAt) > +new Date(range.from),
  );
}
export function minuteLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function validateHours(intervals: WeeklyInterval[]) {
  if (intervals.length > 56) return 'Use at most 56 weekly intervals.';
  for (const row of intervals)
    if (
      !Number.isInteger(row.weekday) ||
      row.weekday < 0 ||
      row.weekday > 6 ||
      !validInterval(row)
    )
      return 'Choose positive, half-hour intervals and a weekday for every row.';
  for (let day = 0; day < 7; day++)
    if (overlaps(intervals.filter((row) => row.weekday === day)))
      return 'Hours on the same weekday must not overlap.';
  return '';
}
function validInterval(row: { startMinute: number; endMinute: number }) {
  return (
    [row.startMinute, row.endMinute].every(Number.isInteger) &&
    row.startMinute >= 0 &&
    row.endMinute <= 1440 &&
    row.startMinute < row.endMinute &&
    row.startMinute % 30 === 0 &&
    row.endMinute % 30 === 0
  );
}
function overlaps(rows: { startMinute: number; endMinute: number }[]) {
  const sorted = [...rows].sort((a, b) => a.startMinute - b.startMinute);
  return sorted.some(
    (row, index) => index > 0 && row.startMinute < sorted[index - 1].endMinute,
  );
}
export function validateOverrides(rows: DateOverride[]) {
  if (rows.length > 16) return 'Use at most 16 date overrides.';
  const starts = new Set<number | undefined>();
  for (const row of rows) {
    if (starts.has(row.startMinute))
      return 'Date overrides must have distinct start times.';
    starts.add(row.startMinute);
    if (
      row.startMinute === undefined &&
      row.endMinute === undefined &&
      row.type === 'UNAVAILABLE'
    )
      continue;
    if (
      row.startMinute === undefined ||
      row.endMinute === undefined ||
      !validInterval({ startMinute: row.startMinute, endMinute: row.endMinute })
    )
      return 'Use positive half-hour intervals, or a full-day closure.';
  }
  for (const type of ['CUSTOM_HOURS', 'UNAVAILABLE'])
    if (
      overlaps(
        rows
          .filter((row) => row.type === type && row.startMinute !== undefined)
          .map((row) => ({
            startMinute: row.startMinute!,
            endMinute: row.endMinute!,
          })),
      )
    )
      return 'Overrides of the same kind must not overlap.';
  return '';
}
