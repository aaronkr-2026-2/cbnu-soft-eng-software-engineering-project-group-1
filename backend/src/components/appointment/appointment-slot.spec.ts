import { AvailabilityOverrideType } from '../../libs/enum/appointment.enum.js';
import {
  appointmentCandidates,
  appointmentDateRange,
  appointmentSlot,
  slotFitsSchedule,
} from './appointment-slot.js';

describe('clinic timezone slot calculations', () => {
  it('uses the clinic date and weekday instead of UTC date', () => {
    const slot = appointmentSlot(
      new Date('2030-01-06T15:00:00Z'),
      'Asia/Seoul',
    );
    expect(slot).toMatchObject({
      date: '2030-01-07',
      weekday: 1,
      startMinute: 0,
      endMinute: 30,
    });
  });
  it('allows a slot ending exactly at local midnight', () => {
    expect(
      appointmentSlot(new Date('2030-01-06T14:30:00Z'), 'Asia/Seoul').endMinute,
    ).toBe(1440);
  });
  it('handles a timezone with a quarter-hour UTC offset', () => {
    expect(
      appointmentSlot(new Date('2030-01-06T04:15:00Z'), 'Asia/Kathmandu')
        .startMinute,
    ).toBe(600);
    expect(() =>
      appointmentSlot(new Date('2030-01-06T04:00:00Z'), 'Asia/Kathmandu'),
    ).toThrow();
  });
  it('handles each explicit instant in the repeated DST hour', () => {
    const first = appointmentSlot(
      new Date('2030-11-03T05:00:00Z'),
      'America/New_York',
    );
    const second = appointmentSlot(
      new Date('2030-11-03T06:00:00Z'),
      'America/New_York',
    );
    expect(first.startMinute).toBe(60);
    expect(second.startMinute).toBe(60);
    expect(+second.endsAt - +first.endsAt).toBe(3_600_000);
  });
  it('generates actual UTC instants across skipped and repeated DST hours', () => {
    const spring = [
      ...appointmentCandidates('2030-03-10', '2030-03-10', 'America/New_York'),
    ];
    const fall = [
      ...appointmentCandidates('2030-11-03', '2030-11-03', 'America/New_York'),
    ];
    expect(spring).toHaveLength(46);
    expect(
      spring.some((slot) => slot.startMinute >= 120 && slot.startMinute < 180),
    ).toBe(false);
    expect(fall).toHaveLength(50);
    expect(fall.filter((slot) => slot.startMinute === 60)).toHaveLength(2);
    const kathmandu = [
      ...appointmentCandidates('2030-01-07', '2030-01-07', 'Asia/Kathmandu'),
    ];
    expect(kathmandu).toHaveLength(48);
    expect(
      kathmandu.every((slot) => slot.startsAt.getUTCMinutes() % 30 === 15),
    ).toBe(true);
  });
  it('rejects impossible calendar dates and ranges larger than 31 days', () => {
    expect(() => appointmentDateRange('2030-02-30', '2030-03-01')).toThrow();
    expect(() => appointmentDateRange('2030-01-01', '2030-02-01')).toThrow();
    expect(() => appointmentDateRange('2030-01-02', '2030-01-01')).toThrow();
  });
});

describe('weekday-only scheduling', () => {
  const hours = [{ startMinute: 0, endMinute: 1440 }];
  it.each([0, 6])(
    'closes weekday %s despite legacy hours and custom overrides',
    (weekday) => {
      const slot = { weekday, startMinute: 600, endMinute: 630 };
      expect(slotFitsSchedule(slot, hours, [])).toBe(false);
      expect(
        slotFitsSchedule(
          slot,
          [],
          [{ ...hours[0], type: AvailabilityOverrideType.CUSTOM_HOURS }],
        ),
      ).toBe(false);
    },
  );
  it.each([1, 2, 3, 4, 5])('allows configured weekday %s', (weekday) => {
    expect(
      slotFitsSchedule(
        { weekday, startMinute: 600, endMinute: 630 },
        hours,
        [],
      ),
    ).toBe(true);
  });
  it.each([
    ['2030-01-07T00:00:00Z', 'Asia/Seoul', true],
    ['2030-01-05T00:00:00Z', 'Asia/Seoul', false],
    ['2030-01-04T14:00:00Z', 'America/New_York', true],
  ])('uses local weekday for %s in %s', (instant, zone, expected) => {
    expect(
      slotFitsSchedule(appointmentSlot(new Date(instant), zone), hours, []),
    ).toBe(expected);
  });
});

describe('standard clinic working hours', () => {
  const slot = (startMinute: number, weekday = 1) => ({
    weekday,
    startMinute,
    endMinute: startMinute + 30,
  });
  const allDay = [{ weekday: 1, startMinute: 0, endMinute: 1440 }];
  const customAllDay = [
    {
      type: AvailabilityOverrideType.CUSTOM_HOURS,
      startMinute: 0,
      endMinute: 1440,
    },
  ];

  it.each([1, 2, 3, 4, 5])(
    'provides 13 default half-hour visits on weekday %s',
    (weekday) => {
      const starts = Array.from({ length: 48 }, (_, i) => i * 30).filter(
        (minute) => slotFitsSchedule(slot(minute, weekday), [], []),
      );
      expect(starts).toEqual([
        540, 570, 600, 630, 660, 690, 810, 840, 870, 900, 930, 960, 990,
      ]);
    },
  );

  it.each([510, 720, 750, 780, 1020])(
    'blocks %s minutes even with legacy weekly hours or custom date hours',
    (minute) => {
      expect(slotFitsSchedule(slot(minute), [], [])).toBe(false);
      expect(slotFitsSchedule(slot(minute), allDay, [])).toBe(false);
      expect(slotFitsSchedule(slot(minute), [], customAllDay)).toBe(false);
    },
  );

  it('does not reopen an omitted weekday in a configured week', () => {
    expect(slotFitsSchedule(slot(600, 2), allDay, [])).toBe(false);
    expect(slotFitsSchedule(slot(600), allDay, [])).toBe(true);
  });

  it('allows narrower configured hours and custom hours within standard bounds', () => {
    const morning = [{ weekday: 1, startMinute: 600, endMinute: 660 }];
    expect(slotFitsSchedule(slot(540), morning, [])).toBe(false);
    expect(slotFitsSchedule(slot(600), morning, [])).toBe(true);
    const custom = [{ ...customAllDay[0], startMinute: 840, endMinute: 900 }];
    expect(slotFitsSchedule(slot(600), morning, custom)).toBe(false);
    expect(slotFitsSchedule(slot(840), morning, custom)).toBe(true);
  });

  it('honors full-day and partial unavailability with default or custom hours', () => {
    const closed = [{ type: AvailabilityOverrideType.UNAVAILABLE }];
    const blocked = [{ ...closed[0], startMinute: 600, endMinute: 630 }];
    expect(slotFitsSchedule(slot(600), [], closed)).toBe(false);
    expect(slotFitsSchedule(slot(600), [], [...customAllDay, ...closed])).toBe(
      false,
    );
    expect(slotFitsSchedule(slot(600), [], blocked)).toBe(false);
    expect(slotFitsSchedule(slot(570), [], blocked)).toBe(true);
    expect(slotFitsSchedule(slot(630), [], blocked)).toBe(true);
  });

  it.each([0, 6])('does not provide default hours on weekend %s', (weekday) => {
    expect(slotFitsSchedule(slot(600, weekday), [], [])).toBe(false);
  });

  it.each(['Asia/Seoul', 'Asia/Kathmandu', 'America/New_York'])(
    'generates standard hours in the clinic timezone %s',
    (timezone) => {
      const visits = [
        ...appointmentCandidates('2030-01-07', '2030-01-07', timezone),
      ].filter((candidate) => slotFitsSchedule(candidate, [], []));
      expect(visits).toHaveLength(13);
      expect(visits[0].startMinute).toBe(540);
      expect(visits[6].startMinute).toBe(810);
      expect(visits[12].endMinute).toBe(1020);
    },
  );
});
