import { useEffect } from 'react';
import { availableSlots } from '../../libs/api/booking';
import { dateInZone } from '../../libs/booking';
import { isWorkingDate } from '../../libs/booking-calendar';
import type { BookingSelection } from './useBookingSelection';

export function useBookingSlots(selection: BookingSelection) {
  const {
    clinicId,
    doctorId,
    specialty,
    date,
    retry,
    linkedTarget,
    linkedKey,
    clinic,
    appliedTarget,
    setSlots,
    setSelected,
    setLoading,
    setError,
    setLinkedChecked,
  } = selection;
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
}
