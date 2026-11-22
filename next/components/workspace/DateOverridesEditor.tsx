import { Button } from '@mui/material';
import { memberName } from '../../libs/api/public-members';
import { setDateOverrides } from '../../libs/api/workspace';
import { label } from '../../libs/booking';
import { minuteLabel } from '../../libs/workspace';
import type { DateOverride } from '../../types/workspace';
import { ScheduleTimeSelect as TimeSelect } from './ScheduleTimeSelect';
import type { ScheduleEditorProps } from './useScheduleDraft';

export function DateOverridesEditor({
  draft,
  doctor,
  zone,
  locked,
  review,
  overrideError,
}: ScheduleEditorProps & { overrideError: string }) {
  const {
    doctorId,
    date,
    dateAck,
    overrides,
    setDate,
    setDateAck,
    setOverrides,
    patchOverride,
  } = draft;
  return (
    <fieldset disabled={locked || !doctor} className="care-card">
      <legend>Date overrides · {zone}</legend>
      <label>
        Override date
        <input
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setDateAck(false);
          }}
        />
      </label>
      <p>
        Custom hours replace weekly hours for this date. Closures block a whole
        day or part of it. An empty replacement clears this date's overrides.
      </p>
      {overrides.map((row, index) => (
        <div className="workspace-interval" key={index}>
          <label>
            Kind
            <select
              value={row.type}
              onChange={(event) =>
                patchOverride(index, {
                  type: event.target.value as DateOverride['type'],
                  startMinute: row.startMinute ?? 540,
                  endMinute: row.endMinute ?? 1020,
                })
              }
            >
              <option value="CUSTOM_HOURS">Custom hours</option>
              <option value="UNAVAILABLE">Closure</option>
            </select>
          </label>
          {row.type === 'UNAVAILABLE' && (
            <label className="care-check">
              <input
                type="checkbox"
                checked={row.startMinute === undefined}
                onChange={(event) =>
                  patchOverride(
                    index,
                    event.target.checked
                      ? { type: 'UNAVAILABLE' }
                      : {
                          type: 'UNAVAILABLE',
                          startMinute: 540,
                          endMinute: 1020,
                        },
                  )
                }
              />
              Full day
            </label>
          )}
          {row.startMinute !== undefined && (
            <>
              <TimeSelect
                label="Start"
                value={row.startMinute}
                onChange={(startMinute) =>
                  patchOverride(index, { ...row, startMinute })
                }
              />
              <TimeSelect
                label="End"
                end
                value={row.endMinute!}
                onChange={(endMinute) =>
                  patchOverride(index, { ...row, endMinute })
                }
              />
            </>
          )}
          <Button
            onClick={() => {
              setOverrides((rows) => rows.filter((_, i) => i !== index));
              setDateAck(false);
            }}
            aria-label={`Remove date override ${index + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        disabled={overrides.length >= 16}
        onClick={() => {
          setOverrides((rows) => [
            ...rows,
            { type: 'CUSTOM_HOURS', startMinute: 540, endMinute: 1020 },
          ]);
          setDateAck(false);
        }}
      >
        Add custom hours
      </Button>
      <Button
        disabled={overrides.length >= 16}
        onClick={() => {
          setOverrides((rows) => [...rows, { type: 'UNAVAILABLE' }]);
          setDateAck(false);
        }}
      >
        Add closure
      </Button>
      {overrideError && <p role="alert">{overrideError}</p>}
      <label className="care-check">
        <input
          type="checkbox"
          checked={dateAck}
          onChange={(event) => setDateAck(event.target.checked)}
        />
        This draft replaces all overrides for {date || 'the chosen date'}.
      </label>
      <Button
        variant="contained"
        disabled={!dateAck || !date || !!overrideError}
        onClick={() => {
          const replacements = overrides.map((row) => ({ ...row }));
          review({
            title: 'Replace date overrides?',
            summary: (
              <>
                <p>
                  {memberName(doctor!)} · {date} · {zone}
                </p>
                {replacements.length ? (
                  <ul>
                    {replacements.map((row, i) => (
                      <li key={i}>
                        {label(row.type)}:{' '}
                        {row.startMinute === undefined
                          ? 'full day'
                          : `${minuteLabel(row.startMinute)}–${minuteLabel(row.endMinute!)}`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Clear this date's overrides and use weekly hours.</p>
                )}
              </>
            ),
            run: async (signal) => {
              await setDateOverrides(doctorId, date, replacements, signal);
              return 'Date overrides saved. Refresh available times to inspect the result.';
            },
          });
        }}
      >
        Review date replacement
      </Button>
    </fieldset>
  );
}
