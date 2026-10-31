import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { useLiveCalendar } from '../../libs/hooks/useLiveCalendar';
import { calendarWindow, entriesForDay } from '../../libs/workspace';
import { dateInZone, label, timeLabel } from '../../libs/booking';
import { shiftDay } from '../../libs/booking-calendar';
import { BookingError, careRequest, detail } from '../../libs/api/booking';
import { CANCEL } from '../../apollo/user/booking';
import { appointmentOutcome } from '../../libs/api/workspace';
import type { SelfProfile } from '../../libs/api/member';
import { memberName, type PublicMember } from '../../libs/api/public-members';
import type { CalendarEntry } from '../../types/workspace';
import type { WorkspaceTask } from './WorkspaceReview';
export function AppointmentSummary({
  row,
  zone,
  doctor,
}: {
  row: CalendarEntry;
  zone: string;
  doctor?: string;
}) {
  return (
    <div className="workspace-appointment">
      <strong>{doctor || `Doctor ${row.doctorId}`}</strong>
      <p>{label(row.specialty || 'Specialty not recorded')}</p>
      <p>
        <time dateTime={row.startsAt}>
          {timeLabel(row.startsAt, row.clinicTimezone || zone)}
        </time>{' '}
        – {timeLabel(row.endsAt, row.clinicTimezone || zone, false)} ·{' '}
        {row.clinicTimezone || zone}
      </p>
      <p>
        <span
          className={`care-status care-status--${row.status.toLowerCase()}`}
        >
          {label(row.status)}
        </span>{' '}
        · {label(row.source)}
      </p>
      <p className="care-reference">Clinic ID: {row.clinicId}</p>
      <p className="care-reference">Patient ID: {row.patientId}</p>
      <p className="care-reference">Appointment: {row._id}</p>
    </div>
  );
}
export function LiveCalendar({
  profile,
  zone,
  team,
  refresh,
  locked,
  review,
  onTimezoneChange,
}: {
  profile: SelfProfile;
  zone: string;
  team: PublicMember[];
  refresh: number;
  locked: boolean;
  review: (task: WorkspaceTask) => void;
  onTimezoneChange: (zone: string) => void;
}) {
  const [date, setDate] = useState(() => dateInZone(new Date(), zone)),
    [days, setDays] = useState<1 | 7>(7),
    [doctorId, setDoctorId] = useState(''),
    [localRefresh, setLocalRefresh] = useState(0),
    [viewed, setViewed] = useState<CalendarEntry>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  let range;
  let rangeError = '';
  try {
    range = calendarWindow(
      date,
      days,
      zone,
      profile.memberType === 'DOCTOR' ? profile._id : doctorId || undefined,
    );
  } catch {
    rangeError = 'Choose a valid clinic-local date.';
  }
  const state = useLiveCalendar(range, refresh + localRefresh);
  const timezoneChanged =
    !!state.snapshot?.clinicTimezone && state.snapshot.clinicTimezone !== zone;
  useEffect(() => {
    const next = state.snapshot?.clinicTimezone;
    if (!next || next === zone) return;
    try {
      new Intl.DateTimeFormat('en', { timeZone: next }).format(new Date());
      onTimezoneChange(next);
    } catch {
      setError(
        'The clinic timezone is unavailable. Refresh your workspace profile.',
      );
    }
  }, [state.snapshot?.clinicTimezone, zone, onTimezoneChange]);

  const names = new Map(team.map((row) => [row._id, memberName(row)]));
  if (profile.memberType === 'DOCTOR')
    names.set(profile._id, profile.memberFullName || profile.memberNick);
  async function view(row: CalendarEntry) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const fresh = await detail('APPOINTMENT', row._id, controller.signal);
      if (!controller.signal.aborted)
        setViewed({
          ...fresh,
          clinicTimezone: row.clinicTimezone,
        } as CalendarEntry);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Could not load appointment.',
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function change(outcome: 'CANCELED' | 'COMPLETED' | 'NO_SHOW') {
    if (!viewed) return;
    const original = viewed;
    setViewed(undefined);
    review({
      title:
        outcome === 'CANCELED'
          ? 'Cancel this appointment?'
          : `Record ${label(outcome).toLowerCase()}?`,
      summary: (
        <>
          <AppointmentSummary
            row={original}
            zone={zone}
            doctor={names.get(original.doctorId)}
          />
          <p>
            {outcome === 'CANCELED'
              ? 'Cancellation releases this slot.'
              : 'This records the final outcome of the visit.'}
          </p>
        </>
      ),
      run: async (signal) => {
        const current = await detail('APPOINTMENT', original._id, signal);
        if (current.status === outcome)
          return `Current status: ${label(current.status)}.`;
        if (
          current.version !== original.version ||
          current.status !== original.status
        )
          throw new BookingError(
            'This appointment changed. Close the review and refresh the calendar.',
            'STALE_COMMITMENT',
          );
        const result =
          outcome === 'CANCELED'
            ? (
                await careRequest<{ cancelAppointment: CalendarEntry }>(
                  CANCEL,
                  { id: original._id },
                  signal,
                  true,
                  true,
                )
              ).cancelAppointment
            : await appointmentOutcome(original._id, outcome, signal);
        return `Current status: ${label(result.status)}.`;
      },
      check: async (signal) => {
        const current = await detail('APPOINTMENT', original._id, signal);
        return current.status === outcome
          ? `Current status: ${label(current.status)}.`
          : undefined;
      },
    });
  }
  const rows = timezoneChanged ? [] : state.snapshot?.entries || [],
    isClinic = profile.memberType === 'CLINIC';
  return (
    <section aria-labelledby="workspace-calendar-title">
      <h2 id="workspace-calendar-title">
        {isClinic ? 'Clinic calendar' : 'My schedule'}
      </h2>
      <div className="workspace-toolbar">
        <label>
          Clinic-local date
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          View
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as 1 | 7)}
          >
            <option value={1}>Day</option>
            <option value={7}>Week</option>
          </select>
        </label>
        {isClinic && (
          <label>
            Doctor
            <select
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
            >
              <option value="">All clinic doctors</option>
              {team.map((row) => (
                <option key={row._id} value={row._id}>
                  {memberName(row)} ·{' '}
                  {label(row.doctorClinicStatus || 'Unknown')}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="care-actions">
        <Button
          disabled={!!rangeError}
          onClick={() => setDate(shiftDay(date, -days))}
        >
          Previous {days === 1 ? 'day' : 'week'}
        </Button>
        <Button onClick={() => setDate(dateInZone(new Date(), zone))}>
          Today
        </Button>
        <Button
          disabled={!!rangeError}
          onClick={() => setDate(shiftDay(date, days))}
        >
          Next {days === 1 ? 'day' : 'week'}
        </Button>
        <Button onClick={() => setLocalRefresh((value) => value + 1)}>
          Refresh calendar
        </Button>
      </div>
      <p className="workspace-sync" role="status">
        {state.status === 'live'
          ? 'Live · checks about every 5 seconds'
          : state.status === 'loading'
            ? 'Loading a consistent calendar…'
            : state.status === 'paused'
              ? 'Updates paused'
              : 'Calendar is not current'}
        {state.updated &&
          ` · Last checked ${new Date(state.updated).toLocaleTimeString()}`}
      </p>
      {(rangeError || state.error || error) && (
        <Alert severity="warning">{rangeError || state.error || error}</Alert>
      )}
      {state.status !== 'live' && state.snapshot && (
        <p>
          Showing the last verified snapshot. Appointment changes are disabled
          until resync finishes.
        </p>
      )}
      {state.snapshot && !timezoneChanged && (
        <>
          <p className="care-meta">
            {rows.length} appointments in this window · includes canceled and
            completed visits · {zone}
          </p>
          <div
            className={`workspace-calendar workspace-calendar--${days === 1 ? 'day' : 'week'}`}
          >
            {Array.from({ length: days }, (_, index) =>
              shiftDay(date, index),
            ).map((day) => {
              const entries = entriesForDay(rows, day, zone);
              return (
                <section className="workspace-day" key={day} aria-label={day}>
                  <h3>
                    {new Intl.DateTimeFormat('en', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(`${day}T12:00:00Z`))}
                  </h3>
                  {!entries.length && (
                    <p className="care-meta">No appointments</p>
                  )}
                  {entries.map((row) => (
                    <button
                      type="button"
                      className={`workspace-event workspace-event--${row.status.toLowerCase()}`}
                      key={row._id}
                      disabled={busy}
                      onClick={() => void view(row)}
                    >
                      <strong>
                        {timeLabel(row.startsAt, zone, false)} –{' '}
                        {timeLabel(row.endsAt, zone, false)}
                      </strong>
                      <span>
                        {names.get(row.doctorId) ||
                          `Doctor …${row.doctorId.slice(-6)}`}
                      </span>
                      <span>
                        {label(row.specialty || 'Unrecorded specialty')}
                      </span>
                      <span>
                        {label(row.status)} · {label(row.source)}
                      </span>
                      <span>Patient …{row.patientId.slice(-6)}</span>
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
        </>
      )}
      <Dialog
        open={!!viewed}
        onClose={() => setViewed(undefined)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="workspace-detail-title"
      >
        <DialogTitle id="workspace-detail-title">
          Appointment details
        </DialogTitle>
        <DialogContent>
          {viewed && (
            <AppointmentSummary
              row={viewed}
              zone={zone}
              doctor={names.get(viewed.doctorId)}
            />
          )}
          <p>
            Details were checked when opened. Confirming a change checks this
            appointment again.
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewed(undefined)}>Close</Button>
          {viewed && isClinic && viewed.status === 'CONFIRMED' && (
            <>
              {+new Date(viewed.startsAt) > Date.now() && (
                <Button
                  color="error"
                  disabled={locked || state.status !== 'live'}
                  onClick={() => change('CANCELED')}
                >
                  Cancel appointment
                </Button>
              )}
              {+new Date(viewed.endsAt) <= Date.now() && (
                <>
                  <Button
                    disabled={locked || state.status !== 'live'}
                    onClick={() => change('NO_SHOW')}
                  >
                    No show
                  </Button>
                  <Button
                    disabled={locked || state.status !== 'live'}
                    onClick={() => change('COMPLETED')}
                  >
                    Mark completed
                  </Button>
                </>
              )}
            </>
          )}
        </DialogActions>
      </Dialog>
    </section>
  );
}
