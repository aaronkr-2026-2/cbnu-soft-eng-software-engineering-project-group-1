import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  calendarDate,
  isWorkingDate,
  workingDate,
  monthDays,
  shiftDay,
  shiftMonth,
} from '../../libs/booking-calendar';

// Adapted from MediBridge's month-header/weekday/date-grid presentation. Slot
// fetching stays in BookPage; this component only chooses a clinic-local date.
export function BookingCalendar({
  value,
  minimum,
  disabled,
  onChange,
}: {
  value: string;
  minimum: string;
  disabled: boolean;
  onChange: (date: string) => void;
}) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const [focused, setFocused] = useState(value);
  const focusRequested = useRef(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const headingId = useId(),
    helpId = useId();
  useEffect(() => {
    setMonth(value.slice(0, 7));
    setFocused(value);
  }, [value]);
  useEffect(() => {
    if (focusRequested.current) {
      buttons.current.get(focused)?.focus();
      focusRequested.current = false;
    }
  }, [month, focused]);
  if (!month) return <p>Choose a care team to see the calendar.</p>;
  const weeks = monthDays(month);
  const enabledDays = weeks
    .flat()
    .filter((day): day is string => !!day && day >= minimum && isWorkingDate(day));
  const tabDate = enabledDays.includes(focused)
    ? focused
    : enabledDays.includes(value)
      ? value
      : enabledDays[0];
  const monthLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(calendarDate(`${month}-01`));
  const fullDate = (day: string) =>
    new Intl.DateTimeFormat('en', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(calendarDate(day));
  function navigate(months: number) {
    const next = shiftMonth(`${month}-01`, months).slice(0, 7);
    setMonth(next);
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const weekday = calendarDate(day).getUTCDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => shiftDay(day, -1),
      ArrowRight: () => shiftDay(day, 1),
      ArrowUp: () => shiftDay(day, -7),
      ArrowDown: () => shiftDay(day, 7),
      Home: () => shiftDay(day, 1 - weekday),
      End: () => shiftDay(day, 5 - weekday),
      PageUp: () => shiftMonth(day, -1),
      PageDown: () => shiftMonth(day, 1),
    };
    if (!moves[event.key]) return;
    event.preventDefault();
    const direction = ['ArrowLeft', 'ArrowUp', 'Home', 'PageUp'].includes(event.key)
      ? -1
      : 1;
    const next = workingDate(moves[event.key](), direction);
    if (next < minimum || disabled) return;
    focusRequested.current = true;
    setFocused(next);
    setMonth(next.slice(0, 7));
  }
  return (
    <section className="care-calendar" aria-label="Choose clinic-local date">
      <div className="care-calendar__heading">
        <button
          type="button"
          aria-label="Previous month"
          disabled={disabled || month <= minimum.slice(0, 7)}
          onClick={() => navigate(-1)}
        >
          ‹
        </button>
        <h3 id={headingId} aria-live="polite">
          {monthLabel}
        </h3>
        <button
          type="button"
          aria-label="Next month"
          disabled={disabled}
          onClick={() => navigate(1)}
        >
          ›
        </button>
      </div>
      <table role="grid" aria-labelledby={headingId} aria-describedby={helpId}>
        <thead>
          <tr>
            {[
              'Sunday',
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
            ].map((day) => (
              <th key={day} scope="col" abbr={day}>
                {day.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, index) => (
            <tr key={index}>
              {week.map((day, index) => (
                <td
                  key={day || `empty-${index}`}
                  aria-selected={day ? day === value : undefined}
                >
                  {day && (
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) buttons.current.set(day, element);
                        else buttons.current.delete(day);
                      }}
                      disabled={disabled || day < minimum || !isWorkingDate(day)}
                      tabIndex={!disabled && day === tabDate ? 0 : -1}
                      aria-label={fullDate(day)}
                      aria-current={day === minimum ? 'date' : undefined}
                      className={day === value ? 'is-selected' : undefined}
                      onFocus={() => setFocused(day)}
                      onKeyDown={(event) => keyDown(event, day)}
                      onClick={() => onChange(day)}
                    >
                      {Number(day.slice(-2))}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="care-meta care-calendar__selection" role="status">
        Selected date: {value ? fullDate(value) : 'Choose a day'}
      </p>
      <p className="care-meta" id={helpId}>
        Use arrow keys to move between days and Enter or Space to select.
        Saturdays and Sundays are non-working days. Available times load after
        you choose a weekday.
      </p>
    </section>
  );
}
