import { Alert, Button } from '@mui/material';
import { memberName } from '../../libs/api/public-members';
import { dateInZone, label, timeLabel } from '../../libs/booking';
import { BookingCalendar } from './BookingCalendar';
import { CommitmentView } from './CommitmentView';
import type { BookingSelection } from './useBookingSelection';
import type { useReplacementSource } from './useReplacementSource';

type SelectionProps = { selection: BookingSelection; uncertain: boolean };

export function CareTeamSelection({ selection, uncertain }: SelectionProps) {
  const {
    clinics,
    doctors,
    clinicId,
    doctorId,
    specialty,
    clinic,
    doctor,
    loading,
    setClinicId,
    setDoctorId,
    setSpecialty,
    setSelected,
  } = selection;
  return (
    <section className="care-card" aria-labelledby="care-team-title">
      <span className="care-step">01 · YOUR CARE TEAM</span>
      <h2 id="care-team-title">Who would you like to see?</h2>
      <p className="care-meta">
        Clinics and care teams come from the first 100 approved doctors in the
        directory.
      </p>
      <fieldset disabled={uncertain}>
        <div className="care-fields">
          <label>
            Clinic
            <select
              value={clinicId}
              onChange={(event) => {
                setClinicId(event.target.value);
                setDoctorId('');
                setSpecialty('');
                setSelected('');
              }}
            >
              <option value="">Choose a clinic</option>
              {clinics.map((row) => (
                <option key={row._id} value={row._id}>
                  {memberName(row)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Doctor
            <select
              value={doctorId}
              disabled={!clinicId || loading === 'doctors'}
              onChange={(event) => setDoctorId(event.target.value)}
            >
              <option value="">Choose a doctor</option>
              {doctors.map((row) => (
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
      {loading === 'clinics' || loading === 'doctors' ? (
        <p role="status">Loading care teams…</p>
      ) : clinicId && !doctors.length ? (
        <p>No doctors are listed at this clinic yet.</p>
      ) : null}
      {doctor?.memberDesc && <p className="care-meta">{doctor.memberDesc}</p>}
      {clinic?.memberAddress && <p>{clinic.memberAddress}</p>}
      {clinics.length >= 100 && (
        <p className="care-meta">Showing the first 100 clinics.</p>
      )}
    </section>
  );
}

export function AppointmentTimeSelection({
  selection,
  uncertain,
}: SelectionProps) {
  const {
    date,
    slots,
    selected,
    loading,
    error,
    clinic,
    doctor,
    setDate,
    setSelected,
    setRetry,
  } = selection;
  return (
    <section className="care-card" aria-labelledby="care-time-title">
      <span className="care-step">02 · YOUR TIME</span>
      <h2 id="care-time-title">Choose a day and time.</h2>
      <BookingCalendar
        value={date}
        minimum={dateInZone(new Date(), clinic?.clinicTimezone || 'UTC')}
        disabled={!doctor || uncertain}
        onChange={setDate}
      />
      <p className="care-meta">
        Times are shown in {clinic?.clinicTimezone || 'the clinic timezone'}.
        Each visit lasts 30 minutes. Weekday hours are 9:00 AM–5:00 PM, with
        lunch from 12:00–1:30 PM.
      </p>
      {loading === 'times' ? (
        <p role="status">Checking available times…</p>
      ) : !doctor ? (
        <p>Choose a care team to see times.</p>
      ) : !slots.length && !error ? (
        <p>No appointment times are listed for this day. Try another date.</p>
      ) : null}
      <fieldset className="care-slots" disabled={uncertain}>
        <legend>Appointment times</legend>
        {slots.map((row) => {
          const eligible =
            row.state === 'AVAILABLE' ||
            (row.state === 'OCCUPIED' && row.canJoinWaitlist);
          return (
            <label
              key={row.startsAt}
              className={`care-slot care-slot--${row.state.toLowerCase()} ${selected === row.startsAt ? 'is-selected' : ''}`}
            >
              <input
                type="radio"
                name="appointment-time"
                value={row.startsAt}
                checked={selected === row.startsAt}
                disabled={!eligible}
                onChange={() => setSelected(row.startsAt)}
              />
              <strong>
                {timeLabel(row.startsAt, row.clinicTimezone, false)}
              </strong>
              <span>
                {row.state === 'AVAILABLE'
                  ? 'Book'
                  : row.state === 'UNAVAILABLE'
                    ? 'Unavailable'
                    : row.canJoinWaitlist
                      ? 'Join waitlist'
                      : 'Occupied'}
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="care-meta">
        Waitlists are for an occupied, exact doctor/time slot at least 48 hours
        ahead. Inside 48 hours, openings are booked manually.
      </p>
      <Button
        disabled={!doctor || uncertain || loading === 'times'}
        onClick={() => setRetry((value) => value + 1)}
      >
        Refresh times
      </Button>
    </section>
  );
}

export function VisitSummary({
  selection,
  uncertain,
  sourceLoading,
  replacing,
  original,
  review,
}: SelectionProps & {
  sourceLoading: boolean;
  replacing: boolean;
  original: ReturnType<typeof useReplacementSource>['original'];
  review: () => void;
}) {
  const { slot, clinic, doctor, loading } = selection;
  return (
    <aside className="care-card care-summary">
      <span className="care-step">YOUR VISIT</span>
      <h2>A little closer to care.</h2>
      {slot ? (
        <>
          <CommitmentView
            value={slot}
            profiles={{
              ...(clinic ? { [clinic._id]: clinic } : {}),
              ...(doctor ? { [doctor._id]: doctor } : {}),
            }}
            zone={slot.clinicTimezone}
          />
          <p>
            {slot.state === 'AVAILABLE'
              ? 'Review before confirming your booking.'
              : 'A waitlist entry is not a confirmed appointment.'}
          </p>
        </>
      ) : (
        <p>Your selected visit will appear here.</p>
      )}
      <Button
        variant="contained"
        fullWidth
        disabled={
          !slot ||
          !!loading ||
          uncertain ||
          sourceLoading ||
          (replacing && !original)
        }
        onClick={review}
      >
        {slot?.state === 'OCCUPIED' ? 'Review waitlist' : 'Review booking'}
      </Button>
      <p className="care-meta">
        Choosing a time does not reserve it. The server checks availability
        again when you confirm.
      </p>
    </aside>
  );
}

export function ReplacementSource({
  source,
  selection,
  uncertain,
  keepOriginal,
}: SelectionProps & {
  source: ReturnType<typeof useReplacementSource>;
  keepOriginal: () => void;
}) {
  const { sourceLoading, sourceError, original } = source;
  const { clinic, doctor } = selection;
  return (
    <section className="care-card">
      <h2>Choose a replacement</h2>
      <p>
        Your current commitment stays in place until the replacement succeeds.
      </p>
      {sourceLoading && <p role="status">Checking your current commitment…</p>}
      {sourceError && <Alert severity="warning">{sourceError}</Alert>}
      {original && (
        <CommitmentView
          title="Current commitment"
          value={original}
          profiles={{
            ...(clinic ? { [clinic._id]: clinic } : {}),
            ...(doctor ? { [doctor._id]: doctor } : {}),
          }}
        />
      )}
      <Button disabled={uncertain} onClick={keepOriginal}>
        Keep current commitment
      </Button>
    </section>
  );
}
