import { appointmentSlot } from './appointment-slot.js';

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
});
