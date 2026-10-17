import { BadRequestException } from '@nestjs/common';
import { APPOINTMENT_SLOT_DURATION_MS } from '../../libs/enum/appointment.enum.js';

// Work from an explicit instant to avoid ambiguous local timestamps during DST.
export function appointmentSlot(startsAt: Date, timezone: string) {
  const endsAt = new Date(startsAt.getTime() + APPOINTMENT_SLOT_DURATION_MS);
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
