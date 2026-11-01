import { displayUsername } from '../../libs/username';
import { useEffect, useState } from 'react';
import { Alert, Button } from '@mui/material';
import {
  clinicTeam,
  reviewDoctor,
  setDateOverrides,
  setWeeklyHours,
} from '../../libs/api/workspace';
import { availableSlots } from '../../libs/api/booking';
import { dateInZone, label, timeLabel } from '../../libs/booking';
import {
  minuteLabel,
  validateHours,
  validateOverrides,
  weekdays,
} from '../../libs/workspace';
import { memberName, type PublicMember } from '../../libs/api/public-members';
import type { SelfProfile } from '../../libs/api/member';
import type { DateOverride, WeeklyInterval } from '../../types/workspace';
import type { Slot } from '../../types/booking';
import type { WorkspaceTask } from './WorkspaceReview';
function TimeSelect({
  value,
  onChange,
  end,
  label: caption,
}: {
  value: number;
  onChange: (value: number) => void;
  end?: boolean;
  label: string;
}) {
  return (
    <label>
      {caption}
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: 48 }, (_, i) => (i + (end ? 1 : 0)) * 30).map(
          (minute) => (
            <option key={minute} value={minute}>
              {minuteLabel(minute)}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
export function TeamSchedules({
  mode,
  profile,
  zone,
  team,
  locked,
  review,
  refresh,
}: {
  mode: string;
  profile: SelfProfile;
  zone: string;
  team: PublicMember[];
  locked: boolean;
  review: (task: WorkspaceTask) => void;
  refresh: number;
}) {
  const [doctorId, setDoctorId] = useState(''),
    [weekly, setWeekly] = useState<WeeklyInterval[]>([]),
    [overrides, setOverrides] = useState<DateOverride[]>([]),
    [date, setDate] = useState(() => dateInZone(new Date(), zone)),
    [weeklyAck, setWeeklyAck] = useState(false),
    [dateAck, setDateAck] = useState(false),
    [preview, setPreview] = useState<Slot[]>([]),
    [previewError, setPreviewError] = useState(''),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewRefresh, setPreviewRefresh] = useState(0);
  const doctor = team.find(
    (row) => row._id === doctorId && row.doctorClinicStatus === 'APPROVED',
  );
  const specialty = doctor?.doctorSpecializations?.[0];
  useEffect(() => {
    setPreview([]);
    setPreviewError('');
    if (mode !== 'schedules' || !doctor || !specialty || !date) return;
    const controller = new AbortController();
    setPreviewBusy(true);
    void availableSlots(
      { doctorId: doctor._id, clinicId: profile._id, specialty },
      date,
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted) setPreview(rows);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setPreviewError(
            reason instanceof Error
              ? reason.message
              : 'Could not load available times.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewBusy(false);
      });
    return () => controller.abort();
  }, [mode, doctorId, specialty, date, profile._id, refresh, previewRefresh]);
  if (mode === 'team')
    return (
      <section aria-labelledby="workspace-team-title">
        <h2 id="workspace-team-title">Doctor applications</h2>
        <p>
          Review pending applications to your clinic. Approved affiliations and
          rejected applications are read-only.
        </p>
        <p className="care-meta">
          Showing up to 100 active doctor records for this clinic.
        </p>
        {!team.length && <p>No doctor applications are listed.</p>}
        <div className="workspace-team">
          {team.map((row) => (
            <article className="care-card" key={row._id}>
              <h3>{memberName(row)}</h3>
              <p>
                {row.doctorSpecializations?.map(label).join(', ') ||
                  'No specialties listed'}
              </p>
              <p>{label(row.doctorClinicStatus || 'Unknown')}</p>
              <p className="care-reference">Doctor ID: {row._id}</p>
              {row.doctorClinicStatus === 'PENDING' &&
                [true, false].map((approve) => (
                  <Button
                    key={String(approve)}
                    disabled={locked}
                    onClick={() =>
                      review({
                        title: approve
                          ? 'Approve doctor application?'
                          : 'Reject doctor application?',
                        summary: (
                          <>
                            <p>
                              {memberName(row)} ·{' '}
                              {profile.clinicName || displayUsername(profile.memberNick)}
                            </p>
                            <p>
                              {approve
                                ? 'Approval allows this doctor to be scheduled at your clinic.'
                                : 'This rejects the pending affiliation request.'}
                            </p>
                          </>
                        ),
                        run: async (signal) =>
                          `${memberName(row)}: ${label(await reviewDoctor(row._id, approve, signal))}.`,
                        check: async (signal) => {
                          const current = (await clinicTeam(signal)).find(
                            (value) => value._id === row._id,
                          );
                          return current?.doctorClinicStatus ===
                            (approve ? 'APPROVED' : 'REJECTED')
                            ? `${memberName(current)}: ${label(current.doctorClinicStatus)}.`
                            : undefined;
                        },
                      })
                    }
                  >
                    {approve ? 'Approve' : 'Reject'}
                  </Button>
                ))}
            </article>
          ))}
        </div>
      </section>
    );
  const weeklyError = validateHours(weekly),
    overrideError = validateOverrides(overrides);
  function patchWeekly(index: number, values: Partial<WeeklyInterval>) {
    setWeekly((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...values } : row)),
    );
    setWeeklyAck(false);
  }
  function patchOverride(index: number, values: DateOverride) {
    setOverrides((rows) => rows.map((row, i) => (i === index ? values : row)));
    setDateAck(false);
  }
  return (
    <section aria-labelledby="workspace-schedule-title">
      <h2 id="workspace-schedule-title">Doctor schedules</h2>
      <label className="workspace-doctor-select">
        Approved doctor
        <select
          value={doctorId}
          disabled={locked}
          onChange={(event) => {
            setDoctorId(event.target.value);
            setWeekly([]);
            setOverrides([]);
            setWeeklyAck(false);
            setDateAck(false);
          }}
        >
          <option value="">Choose a doctor</option>
          {team
            .filter((row) => row.doctorClinicStatus === 'APPROVED')
            .map((row) => (
              <option key={row._id} value={row._id}>
                {memberName(row)}
              </option>
            ))}
        </select>
      </label>
      <Alert severity="info">
        These are replacement drafts. Saved hours cannot be loaded through the
        current API. Enter the entire weekly schedule or all overrides for the
        chosen date. Existing bookings and waitlists must remain within working
        hours.
      </Alert>
      <fieldset disabled={locked || !doctor} className="care-card">
        <legend>Weekly hours · {zone}</legend>
        <p>
          Dates without weekly intervals are closed unless custom date hours
          apply. Multiple intervals per day are supported.
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
                {weekdays.map((day, value) => (
                  <option key={day} value={value}>
                    {day}
                  </option>
                ))}
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
          {weekly.length ? '' : '; no weekly working hours will remain'}.
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
                    <p>Clear all weekly working hours.</p>
                  )}
                  <p>
                    This replaces the whole weekly schedule. Existing
                    commitments remain protected by the server.
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
          Custom hours replace weekly hours for this date. Closures block a
          whole day or part of it. An empty replacement clears this date's
          overrides.
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
      <section className="care-card">
        <h3>Available times preview</h3>
        <p>
          Preview for {date} · {zone}. This shows effective slots, not the saved
          configuration. Occupancy may change.
        </p>
        <Button
          disabled={!doctor || previewBusy}
          onClick={() => setPreviewRefresh((value) => value + 1)}
        >
          Refresh available times
        </Button>
        {previewBusy ? (
          <p role="status">Loading available times…</p>
        ) : previewError ? (
          <Alert severity="warning">{previewError}</Alert>
        ) : !preview.length ? (
          <p>No times returned for this date.</p>
        ) : (
          <ul className="workspace-times">
            {preview.map((row) => (
              <li key={row.startsAt}>
                {timeLabel(row.startsAt, row.clinicTimezone, false)} ·{' '}
                {label(row.state)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
