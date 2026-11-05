// Calendar arithmetic uses UTC only as a date container. These YYYY-MM-DD values
// are clinic-local dates, never appointment instants or browser-local midnights.
export function calendarDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}
export function shiftDay(value: string, days: number) {
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function shiftMonth(value: string, months: number) {
  const date = calendarDate(value),
    day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}
export function monthDays(month: string): (string | null)[][] {
  const first = calendarDate(`${month}-01`);
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let day = 1; day <= length; day++)
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7),
  );
}

export function isWorkingDate(value: string) {
  const weekday = calendarDate(value).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}
// Advance a clinic-local date to a weekday without converting timezones.
export function workingDate(value: string, direction: 1 | -1 = 1): string {
  if (!Number.isFinite(calendarDate(value).getTime()))
    throw new Error('Invalid clinic-local date');
  let next = value;
  while (!isWorkingDate(next)) next = shiftDay(next, direction);
  return next;
}
