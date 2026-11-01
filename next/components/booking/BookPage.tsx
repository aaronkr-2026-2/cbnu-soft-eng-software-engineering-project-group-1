import { isWorkingDate, workingDate } from '../../libs/booking-calendar';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Alert, Button } from '@mui/material';
import type {
  Action,
  Commitment,
  CommitmentKind,
  Receipt,
  Slot,
} from '../../types/booking';
import { availableSlots, detail, publicMember } from '../../libs/api/booking';
import {
  fetchMembers,
  memberName,
  type PublicMember,
} from '../../libs/api/public-members';
import {
  commitment,
  dateInZone,
  idPattern,
  label,
  replaceable,
  timeLabel,
} from '../../libs/booking';
import { CareLayout } from './CareLayout';
import { PatientGate } from './PatientGate';
import { CommitmentView } from './CommitmentView';
import { ActionDialog } from './ActionDialog';
import { BookingCalendar } from './BookingCalendar';
import { linkedBookingTarget } from '../../libs/notification';
export function BookPage() {
  return (
    <CareLayout
      title="Find your next visit."
      intro="Choose your care team and a time. Every appointment lasts 30 minutes."
    >
      <PatientGate>
        <BookingForm />
      </PatientGate>
    </CareLayout>
  );
}
function BookingForm() {
  const router = useRouter();
  const linkedTarget = linkedBookingTarget(router.query);
  const linkedKey = linkedTarget
    ? `${linkedTarget.doctorId}:${linkedTarget.clinicId}:${linkedTarget.specialty}:${linkedTarget.startsAt}`
    : '';
  const appliedTarget = useRef('');
  const [linkedChecked, setLinkedChecked] = useState(false);
  const [clinics, setClinics] = useState<PublicMember[]>([]),
    [doctors, setDoctors] = useState<PublicMember[]>([]),
    [clinicId, setClinicId] = useState(''),
    [doctorId, setDoctorId] = useState(''),
    [specialty, setSpecialty] = useState(''),
    [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]),
    [selected, setSelected] = useState(''),
    [loading, setLoading] = useState('clinics'),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [directoryRetry, setDirectoryRetry] = useState(0);
  const previousClinic = useRef('');
  const [original, setOriginal] = useState<Commitment>(),
    [sourceError, setSourceError] = useState(''),
    [sourceLoading, setSourceLoading] = useState(false),
    [action, setAction] = useState<Action>(),
    [open, setOpen] = useState(false),
    [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    appliedTarget.current = '';
    setLinkedChecked(false);
    if (linkedTarget) {
      setClinicId(linkedTarget.clinicId);
      setDoctorId(linkedTarget.doctorId);
      setSpecialty(linkedTarget.specialty);
      setSelected('');
    }
    // linkedKey contains every input of the target; user edits do not reapply it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedKey]);
  const clinic = clinics.find((row) => row._id === clinicId),
    doctor = doctors.find((row) => row._id === doctorId),
    slot = slots.find((row) => row.startsAt === selected);
  const replacing =
    typeof router.query.replaceId === 'string' &&
    (router.query.replaceKind === 'APPOINTMENT' ||
      router.query.replaceKind === 'WAITLIST');
  useEffect(() => {
    if (!router.isReady) return;
    const controller = new AbortController();
    setLoading('clinics');
    setError('');
    const requested =
      typeof router.query.clinicId === 'string' &&
      idPattern.test(router.query.clinicId)
        ? router.query.clinicId
        : '';
    void fetchMembers(undefined, controller.signal)
      .then(async (rows) => {
        if (requested && !rows.some((row) => row._id === requested)) {
          try {
            const extra = await publicMember(requested, controller.signal);
            if (extra.memberType === 'CLINIC') rows = [...rows, extra];
          } catch {
            /* directory error displayed by normal selection */
          }
        }
        if (!controller.signal.aborted) {
          setClinics(rows);
          if (requested && rows.some((row) => row._id === requested))
            setClinicId((current) => current || requested);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('We could not load clinics. Try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading('');
      });
    return () => controller.abort();
  }, [router.isReady, router.query.clinicId, directoryRetry]);
  useEffect(() => {
    if (previousClinic.current !== clinicId) {
      setDoctors([]);
      setDoctorId('');
      setSpecialty('');
      setSlots([]);
      setSelected('');
      previousClinic.current = clinicId;
    }
    if (!clinicId) return;
    const controller = new AbortController();
    setLoading('doctors');
    setError('');
    void fetchMembers(clinicId, controller.signal)
      .then(async (rows) => {
        const requested =
          typeof router.query.doctorId === 'string'
            ? router.query.doctorId
            : '';
        if (
          idPattern.test(requested) &&
          !rows.some((row) => row._id === requested)
        ) {
          try {
            const extra = await publicMember(requested, controller.signal);
            if (
              extra.memberType === 'DOCTOR' &&
              extra.clinicId === clinicId &&
              extra.doctorClinicStatus === 'APPROVED' &&
              extra.memberStatus === 'ACTIVE'
            )
              rows = [...rows, extra];
          } catch {
            /* Public lookup failure does not invent a bookable doctor. */
          }
        }
        if (controller.signal.aborted) return;
        setDoctors(rows);
        setDoctorId((current) =>
          rows.some((row) => row._id === current)
            ? current
            : rows.some((row) => row._id === requested)
              ? requested
              : '',
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('We could not load this care team. Try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading('');
      });
    return () => controller.abort();
  }, [clinicId, router.query.doctorId, directoryRetry]);
  useEffect(() => {
    setSpecialty((current) =>
      doctor?.doctorSpecializations?.includes(current)
        ? current
        : linkedTarget?.doctorId === doctorId &&
            doctor?.doctorSpecializations?.includes(linkedTarget.specialty)
          ? linkedTarget.specialty
          : doctor?.doctorSpecializations?.[0] || '',
    );
  }, [doctorId, doctor, linkedTarget?.specialty, linkedTarget?.doctorId]);
  useEffect(() => {
    if (clinic?.clinicTimezone) {
      try {
        const targetDate = dateInZone(
          linkedTarget?.clinicId === clinicId
            ? new Date(linkedTarget.startsAt)
            : new Date(),
          clinic.clinicTimezone,
        );
        // Exact-slot links retain their date so a closed target is explained.
        setDate(
          linkedTarget?.clinicId === clinicId ? targetDate : workingDate(targetDate),
        );
      } catch {
        setDate('');
      }
    }
  }, [
    clinicId,
    clinic?.clinicTimezone,
    linkedTarget?.startsAt,
    linkedTarget?.clinicId,
  ]);
  useEffect(() => {
    setSlots([]);
    setSelected('');
    if (!clinicId || !doctorId || !specialty || !date) return;
    if (!isWorkingDate(date)) {
      setLoading('');
      setError('Saturdays and Sundays are non-working days. Choose a weekday.');
      setLinkedChecked(true);
      return;
    }
    const controller = new AbortController();
    setLoading('times');
    setError('');
    void availableSlots(
      { clinicId, doctorId, specialty },
      date,
      controller.signal,
    )
      .then((rows) => {
        if (controller.signal.aborted) return;
        setSlots(rows);
        if (
          linkedTarget &&
          appliedTarget.current !== linkedKey &&
          doctorId === linkedTarget.doctorId &&
          clinicId === linkedTarget.clinicId &&
          specialty === linkedTarget.specialty &&
          clinic?.clinicTimezone &&
          date ===
            dateInZone(new Date(linkedTarget.startsAt), clinic.clinicTimezone)
        ) {
          const match = rows.find(
            (row) => row.startsAt === linkedTarget.startsAt,
          );
          setSelected(
            match && (match.state === 'AVAILABLE' || match.canJoinWaitlist)
              ? match.startsAt
              : '',
          );
          appliedTarget.current = linkedKey;
          setLinkedChecked(true);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : 'Could not load times.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading('');
      });
    return () => controller.abort();
  }, [
    clinicId,
    doctorId,
    specialty,
    date,
    retry,
    linkedKey,
    clinic?.clinicTimezone,
  ]);
  useEffect(() => {
    setOriginal(undefined);
    setSourceError('');
    setSourceLoading(false);
    if (!replacing) return;
    const id = String(router.query.replaceId),
      kind = router.query.replaceKind as CommitmentKind;
    if (!idPattern.test(id)) {
      setSourceError(
        'This replacement link is invalid. Keep the original and return to My Care.',
      );
      return;
    }
    const controller = new AbortController();
    setSourceLoading(true);
    void detail(kind, id, controller.signal)
      .then((row) => {
        if (controller.signal.aborted) return;
        const source = commitment(kind, row);
        if (!replaceable(source)) {
          setSourceError(
            'That commitment changed or is no longer replaceable. Keep it and refresh My Care.',
          );
          return;
        }
        setOriginal(source);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSourceError(
            'We could not verify the original commitment. Keep it and refresh My Care.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSourceLoading(false);
      });
    return () => controller.abort();
  }, [replacing, router.query.replaceId, router.query.replaceKind, retry]);
  function keepOriginal() {
    void router.replace('/book', undefined, { shallow: true });
    setOriginal(undefined);
    setSourceError('');
  }
  function review() {
    if (!slot || uncertain) return;
    setAction({
      operation: original ? 'REPLACE' : 'CREATE',
      kind: slot.state === 'AVAILABLE' ? 'APPOINTMENT' : 'WAITLIST',
      target: { doctorId, clinicId, specialty, startsAt: slot.startsAt },
      original,
    });
    setOpen(true);
  }
  function complete(_receipt: Receipt) {
    setUncertain(false);
    setRetry((value) => value + 1);
    if (replacing) keepOriginal();
  }
  return (
    <>
      {linkedTarget && (
        <Alert severity="info">
          This link refers to one exact doctor, specialty and time.{' '}
          {linkedChecked
            ? 'The time has been checked; only currently eligible options can be selected.'
            : 'Choose the linked care team to check its current time.'}{' '}
          An alert does not reserve a slot.
        </Alert>
      )}
      {replacing && (
        <section className="care-card">
          <h2>Choose a replacement</h2>
          <p>
            Your current commitment stays in place until the replacement
            succeeds.
          </p>
          {sourceLoading && (
            <p role="status">Checking your current commitment…</p>
          )}
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
      )}
      {error && (
        <Alert
          severity="warning"
          action={
            <Button
              onClick={() => {
                setDirectoryRetry((value) => value + 1);
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {uncertain && (
        <Alert severity="warning">
          A previous request has an uncertain result. Check it before making
          another request.{' '}
          <Button onClick={() => setOpen(true)}>Check previous request</Button>
        </Alert>
      )}
      <div className="care-book-grid">
        <div>
          <section className="care-card" aria-labelledby="care-team-title">
            <span className="care-step">01 · YOUR CARE TEAM</span>
            <h2 id="care-team-title">Who would you like to see?</h2>
            <p className="care-meta">
              Clinics and care teams come from the first 100 approved doctors in
              the directory.
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
            {doctor?.memberDesc && (
              <p className="care-meta">{doctor.memberDesc}</p>
            )}
            {clinic?.memberAddress && <p>{clinic.memberAddress}</p>}
            {clinics.length >= 100 && (
              <p className="care-meta">Showing the first 100 clinics.</p>
            )}
          </section>
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
              Times are shown in{' '}
              {clinic?.clinicTimezone || 'the clinic timezone'}. Each visit
              lasts 30 minutes.
            </p>
            {loading === 'times' ? (
              <p role="status">Checking available times…</p>
            ) : !doctor ? (
              <p>Choose a care team to see times.</p>
            ) : !slots.length && !error ? (
              <p>
                No appointment times are listed for this day. Try another date.
              </p>
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
              Waitlists are for an occupied, exact doctor/time slot at least 48
              hours ahead. Inside 48 hours, openings are booked manually.
            </p>
            <Button
              disabled={!doctor || uncertain || loading === 'times'}
              onClick={() => setRetry((value) => value + 1)}
            >
              Refresh times
            </Button>
          </section>
        </div>
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
      </div>
      {action && (
        <ActionDialog
          action={action}
          open={open}
          zone={clinic?.clinicTimezone || undefined}
          onUncertain={() => setUncertain(true)}
          onComplete={complete}
          onClose={(pending) => {
            setOpen(false);
            if (!pending) {
              setAction(undefined);
              setRetry((value) => value + 1);
            }
          }}
        />
      )}
    </>
  );
}
