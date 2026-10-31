import { BadRequestException } from '@nestjs/common';
import {
  AvailabilityOverrideType,
  APPOINTMENT_SLOT_DURATION_MS,
} from '../../libs/enum/appointment.enum.js';

// Work from an explicit instant to avoid ambiguous local timestamps during DST.
function clinicFormatter(timezone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new BadRequestException('Clinic timezone is invalid');
  }
  return formatter;
}

function slotWithFormatter(startsAt: Date, formatter: Intl.DateTimeFormat) {
  const endsAt = new Date(startsAt.getTime() + APPOINTMENT_SLOT_DURATION_MS);
  const parts = (date: Date) => {
    const values = Object.fromEntries(
      formatter.formatToParts(date).map(({ type, value }) => [type, value]),
    );
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      minute: Number(values.hour) * 60 + Number(values.minute),
    };
  };
  const start = parts(startsAt);
  const last = parts(new Date(endsAt.getTime() - 1));
  if (
    startsAt.getUTCSeconds() !== 0 ||
    startsAt.getUTCMilliseconds() !== 0 ||
    start.minute % 30 !== 0 ||
    last.date !== start.date ||
    last.minute !== start.minute + 29
  ) {
    throw new BadRequestException(
      'Choose a 30-minute slot aligned to clinic local time',
    );
  }
  return {
    endsAt,
    date: start.date,
    weekday: new Date(`${start.date}T00:00:00Z`).getUTCDay(),
    startMinute: start.minute,
    endMinute: start.minute + 30,
  };
}

export function appointmentSlot(startsAt: Date, timezone: string) {
  return slotWithFormatter(startsAt, clinicFormatter(timezone));
}

export function appointmentDateRange(fromDate: string, toDate: string) {
  const parse = (date: string) => {
    const ms = Date.parse(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(ms) ||
      new Date(ms).toISOString().slice(0, 10) !== date
    )
      throw new BadRequestException('Invalid clinic-local date');
    return ms;
  };
  const from = parse(fromDate),
    to = parse(toDate);
  if (to < from || to - from > 30 * 86400_000)
    throw new BadRequestException('Choose a range of 1 to 31 days');
  return { from, to };
}

// Scan UTC instants so DST gaps/repeated hours remain unambiguous. Modern IANA
// offsets include quarter hours; appointmentSlot retains local :00/:30 alignment.
export function* appointmentCandidates(
  fromDate: string,
  toDate: string,
  timezone: string,
) {
  const { from, to } = appointmentDateRange(fromDate, toDate);
  const formatter = clinicFormatter(timezone);
  for (let ms = from - 86400_000; ms < to + 2 * 86400_000; ms += 15 * 60_000) {
    const startsAt = new Date(ms);
    let slot: ReturnType<typeof slotWithFormatter>;
    try {
      slot = slotWithFormatter(startsAt, formatter);
    } catch {
      continue;
    }
    if (slot.date >= fromDate && slot.date <= toDate)
      yield { startsAt, ...slot };
  }
}

type Hours = { startMinute?: number | null; endMinute?: number | null };
export function slotFitsSchedule(
  slot: { startMinute: number; endMinute: number },
  hours: Hours[],
  overrides: (Hours & { type: AvailabilityOverrideType })[],
) {
  const blocked = overrides.some(
    (row) =>
      row.type === AvailabilityOverrideType.UNAVAILABLE &&
      (row.startMinute == null ||
        row.endMinute == null ||
        (row.startMinute < slot.endMinute && row.endMinute > slot.startMinute)),
  );
  const custom = overrides.filter(
    (row) => row.type === AvailabilityOverrideType.CUSTOM_HOURS,
  );
  return (
    !blocked &&
    (custom.length ? custom : hours).some(
      (row) =>
        row.startMinute != null &&
        row.endMinute != null &&
        row.startMinute <= slot.startMinute &&
        row.endMinute >= slot.endMinute,
    )
  );
}
