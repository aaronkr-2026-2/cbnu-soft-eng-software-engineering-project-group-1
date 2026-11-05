import { isWorkingDate, workingDate } from '../../libs/booking-calendar';
import { useEffect, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { BookingCalendar } from '../booking/BookingCalendar';
import { availableSlots } from '../../libs/api/booking';
import { calendarSnapshot, staffBooking } from '../../libs/api/workspace';
import { dateInZone, idPattern, label, timeLabel } from '../../libs/booking';
import { memberName, type PublicMember } from '../../libs/api/public-members';
import type { Slot } from '../../types/booking';
import type { WorkspaceTask } from './WorkspaceReview';
export function StaffBooking({
  clinicId,
  zone,
  team,
  locked,
  review,
}: {
  clinicId: string;
  zone: string;
  team: PublicMember[];
  locked: boolean;
  review: (task: WorkspaceTask) => void;
}) {
  const [doctorId, setDoctorId] = useState(''),
    [specialty, setSpecialty] = useState(''),
    [date, setDate] = useState(() => workingDate(dateInZone(new Date(), zone))),
    [patientId, setPatientId] = useState(''),
    [source, setSource] = useState<'PHONE' | 'WALK_IN'>('PHONE'),
    [slots, setSlots] = useState<Slot[]>([]),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const doctor = team.find(
      (row) => row._id === doctorId && row.doctorClinicStatus === 'APPROVED',
    ),
    slot = slots.find(
      (row) => row.startsAt === selected && row.state === 'AVAILABLE',
    );
  useEffect(() => {
    setSpecialty(doctor?.doctorSpecializations?.[0] || '');
  }, [doctorId, doctor]);
  useEffect(() => {
    setSlots([]);
    setSelected('');
    setError('');
    if (!doctor || !date || !specialty || !isWorkingDate(date)) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    void availableSlots(
      { doctorId, clinicId, specialty },
      date,
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted) setSlots(rows);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load available times.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [doctorId, clinicId, specialty, date, refresh]);
  function prepare() {
    if (!doctor || !slot || !idPattern.test(patientId.trim())) return;
    const input = {
        doctorId,
        patientId: patientId.trim().toLowerCase(),
        specialty,
        startsAt: slot.startsAt,
        source,
      },
      target = slot;
    const baseline = new Set<string>();
    const matches = async (signal: AbortSignal) =>
      (
        await calendarSnapshot(
          { doctorId, from: target.startsAt, to: target.endsAt },
          signal,
        )
      ).entries.filter(
        (row) =>
          row.patientId === input.patientId &&
          row.startsAt === input.startsAt &&
          row.specialty === input.specialty,
      );
    review({
      title: 'Create staff booking?',
      summary: (
        <>
          <p>
            {memberName(doctor)} · {label(specialty)} · {label(source)}
          </p>
          <p>
            {timeLabel(slot.startsAt, zone)} · {zone} · 30 minutes
          </p>
          <p className="care-reference">Patient ID: {input.patientId}</p>
          <p>
            This creates a confirmed appointment for an existing active patient.
            Availability and patient conflicts are checked again by the server.
          </p>
        </>
      ),
      run: async (signal) => {
        for (const row of await matches(signal)) baseline.add(row._id);
        const result = await staffBooking(input, signal);
        setSelected('');
        setRefresh((value) => value + 1);
        return `Booking ${result._id}: ${label(result.status)} (${label(result.source)}).`;
      },
      check: async (signal) => {
        const found = (await matches(signal)).filter(
          (row) => !baseline.has(row._id),
        );
        return found.length === 1
          ? `Booking ${found[0]._id}: ${label(found[0].status)} (${label(found[0].source)}).`
          : undefined;
      },
    });
  }
  return (
    <section aria-labelledby="workspace-staff-title">
      <h2 id="workspace-staff-title">Phone and walk-in bookings</h2>
      <p>
        Use the existing patient's account ID. This form does not create a
        patient account or enroll them in a waitlist.
      </p>
      <fieldset disabled={locked}>
        <div className="workspace-toolbar">
          <label>
            Patient ID
            <input
              value={patientId}
              maxLength={24}
              onChange={(event) => setPatientId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Booking source
            <select
              value={source}
              onChange={(event) =>
                setSource(event.target.value as 'PHONE' | 'WALK_IN')
              }
            >
              <option value="PHONE">Phone</option>
              <option value="WALK_IN">Walk-in</option>
            </select>
          </label>
          <label>
            Approved doctor
            <select
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
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
          <label>
            Specialty
            <select
              value={specialty}
              disabled={!doctor}
              onChange={(event) => setSpecialty(event.target.value)}
            >
              <option value="">Choose a specialty</option>
              {doctor?.doctorSpecializations?.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      {patientId && !idPattern.test(patientId.trim()) && (
        <p role="alert">Enter a 24-character patient account ID.</p>
      )}
      <BookingCalendar
        value={date}
        minimum={dateInZone(new Date(), zone)}
        disabled={!doctor || locked}
        onChange={setDate}
      />
      <p className="care-meta">
        Clinic timezone: {zone}. Every appointment lasts 30 minutes.
      </p>
      {error && <Alert severity="warning">{error}</Alert>}
      {busy ? (
        <p role="status">Checking available times…</p>
      ) : doctor && !slots.length ? (
        <p>No times are listed for this date.</p>
      ) : null}
      <fieldset disabled={locked || busy} className="care-slots">
        <legend>Appointment times</legend>
        {slots.map((row) => (
          <label
            className={`care-slot ${selected === row.startsAt ? 'is-selected' : ''}`}
            key={row.startsAt}
          >
            <input
              type="radio"
              name="staff-time"
              checked={selected === row.startsAt}
              disabled={row.state !== 'AVAILABLE'}
              onChange={() => setSelected(row.startsAt)}
            />
            <strong>
              {timeLabel(row.startsAt, row.clinicTimezone, false)}
            </strong>
            <span>{row.state === 'AVAILABLE' ? 'Book' : label(row.state)}</span>
          </label>
        ))}
      </fieldset>
      <div className="care-actions">
        <Button
          disabled={locked || busy || !doctor}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh times
        </Button>
        <Button
          variant="contained"
          disabled={
            locked || busy || !slot || !idPattern.test(patientId.trim())
          }
          onClick={prepare}
        >
          Review staff booking
        </Button>
      </div>
    </section>
  );
}
