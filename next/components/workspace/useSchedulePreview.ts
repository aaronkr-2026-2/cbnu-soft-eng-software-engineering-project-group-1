import { useEffect, useState } from 'react';
import { availableSlots } from '../../libs/api/booking';
import type { Slot } from '../../types/booking';
import type { SelfProfile } from '../../libs/api/member';
import type { PublicMember } from '../../libs/api/public-members';

export function useSchedulePreview({
  mode,
  doctorId,
  doctor,
  specialty,
  date,
  profile,
  refresh,
}: {
  mode: string;
  doctorId: string;
  doctor: PublicMember | undefined;
  specialty: string | undefined;
  date: string;
  profile: SelfProfile;
  refresh: number;
}) {
  const [preview, setPreview] = useState<Slot[]>([]),
    [previewError, setPreviewError] = useState(''),
    [previewBusy, setPreviewBusy] = useState(false),
    [previewRefresh, setPreviewRefresh] = useState(0);
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
  return { preview, previewError, previewBusy, setPreviewRefresh };
}
export type SchedulePreviewState = ReturnType<typeof useSchedulePreview>;
