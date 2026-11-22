import { useEffect, useRef, useState } from 'react';
import type { NextRouter } from 'next/router';
import type { Slot } from '../../types/booking';
import { publicMember } from '../../libs/api/booking';
import { fetchMembers, type PublicMember } from '../../libs/api/public-members';
import { dateInZone, idPattern } from '../../libs/booking';
import { workingDate } from '../../libs/booking-calendar';
import { linkedBookingTarget } from '../../libs/notification';

export function useBookingSelection(router: NextRouter) {
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
          linkedTarget?.clinicId === clinicId
            ? targetDate
            : workingDate(targetDate),
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
  return {
    clinics,
    doctors,
    clinicId,
    doctorId,
    specialty,
    date,
    slots,
    selected,
    loading,
    error,
    retry,
    linkedTarget,
    linkedKey,
    linkedChecked,
    appliedTarget,
    clinic,
    doctor,
    slot,
    setClinicId,
    setDoctorId,
    setSpecialty,
    setDate,
    setSlots,
    setSelected,
    setLoading,
    setError,
    setRetry,
    setDirectoryRetry,
    setLinkedChecked,
  };
}

export type BookingSelection = ReturnType<typeof useBookingSelection>;
