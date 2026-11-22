import { Button } from '@mui/material';
import { memberName } from '../../libs/api/public-members';
import { setWeeklyHours } from '../../libs/api/workspace';
import { minuteLabel, weekdays } from '../../libs/workspace';
import { ScheduleTimeSelect as TimeSelect } from './ScheduleTimeSelect';
import type { ScheduleEditorProps } from './useScheduleDraft';

export function WeeklyHoursEditor({
  draft,
  doctor,
  zone,
  locked,
  review,
  weeklyError,
}: ScheduleEditorProps & { weeklyError: string }) {
  const { doctorId, weekly, weeklyAck, setWeekly, setWeeklyAck, patchWeekly } =
    draft;
  return (
    <fieldset disabled={locked || !doctor} className="care-card">
      <legend>Weekly hours · {zone}</legend>
      <p>
        Default hours are Monday–Friday, 9:00 AM–5:00 PM, with lunch from
        12:00–1:30 PM. Saved weekly hours and custom date hours must fit within
        these working windows. Once weekly hours are configured, omitted
        weekdays are closed. Multiple intervals per weekday are supported.
      </p>
      {weekly.map((row, index) => (
        <div className="workspace-interval" key={index}>
          <label>
            Weekday
            <select
              value={row.weekday}
              onChange={(event) =>
                patchWeekly(index, { weekday: Number(event.target.value) })
              }
            >
              {weekdays.map((day, value) =>
                value >= 1 && value <= 5 ? (
                  <option key={day} value={value}>
                    {day}
                  </option>
                ) : null,
              )}
            </select>
          </label>
          <TimeSelect
            label="Start"
            value={row.startMinute}
            onChange={(startMinute) => patchWeekly(index, { startMinute })}
          />
          <TimeSelect
            label="End"
            end
            value={row.endMinute}
            onChange={(endMinute) => patchWeekly(index, { endMinute })}
          />
          <Button
            onClick={() => {
              setWeekly((rows) => rows.filter((_, i) => i !== index));
              setWeeklyAck(false);
            }}
            aria-label={`Remove weekly interval ${index + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        disabled={weekly.length >= 56}
        onClick={() => {
          setWeekly((rows) => [
            ...rows,
            { weekday: 1, startMinute: 540, endMinute: 1020 },
          ]);
          setWeeklyAck(false);
        }}
      >
        Add weekly interval
      </Button>
      {weeklyError && <p role="alert">{weeklyError}</p>}
      <label className="care-check">
        <input
          type="checkbox"
          checked={weeklyAck}
          onChange={(event) => setWeeklyAck(event.target.checked)}
        />
        This draft is the complete replacement weekly schedule
        {weekly.length ? '' : '; standard weekday hours will be restored'}.
      </label>
      <Button
        variant="contained"
        disabled={!weeklyAck || !!weeklyError}
        onClick={() => {
          const intervals = weekly.map((row) => ({ ...row }));
          review({
            title: 'Replace weekly hours?',
            summary: (
              <>
                <p>
                  {memberName(doctor!)} · {zone}
                </p>
                {intervals.length ? (
                  <ul>
                    {intervals.map((row, i) => (
                      <li key={i}>
                        {weekdays[row.weekday]} {minuteLabel(row.startMinute)}
                        –{minuteLabel(row.endMinute)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Clear saved weekly hours and restore standard weekday hours.
                  </p>
                )}
                <p>
                  This replaces the whole weekly schedule. Existing commitments
                  remain protected by the server.
                </p>
              </>
            ),
            run: async (signal) => {
              await setWeeklyHours(doctorId, intervals, signal);
              return 'Weekly hours saved. Refresh available times to inspect the resulting schedule.';
            },
          });
        }}
      >
        Review weekly replacement
      </Button>
    </fieldset>
  );
}
