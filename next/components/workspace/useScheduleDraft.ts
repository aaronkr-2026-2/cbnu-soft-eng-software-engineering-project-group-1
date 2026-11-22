import { useState } from 'react';
import { dateInZone } from '../../libs/booking';
import type { DateOverride, WeeklyInterval } from '../../types/workspace';
import type { PublicMember } from '../../libs/api/public-members';
import type { WorkspaceTask } from './WorkspaceReview';

export function useScheduleDraft(zone: string) {
  const [doctorId, setDoctorId] = useState(''),
    [weekly, setWeekly] = useState<WeeklyInterval[]>([]),
    [overrides, setOverrides] = useState<DateOverride[]>([]),
    [date, setDate] = useState(() => dateInZone(new Date(), zone)),
    [weeklyAck, setWeeklyAck] = useState(false),
    [dateAck, setDateAck] = useState(false);
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
  return {
    doctorId,
    weekly,
    overrides,
    date,
    weeklyAck,
    dateAck,
    setDoctorId,
    setWeekly,
    setOverrides,
    setDate,
    setWeeklyAck,
    setDateAck,
    patchWeekly,
    patchOverride,
  };
}
export type ScheduleDraft = ReturnType<typeof useScheduleDraft>;
export type ScheduleEditorProps = {
  draft: ScheduleDraft;
  doctor: PublicMember | undefined;
  zone: string;
  locked: boolean;
  review: (task: WorkspaceTask) => void;
};
