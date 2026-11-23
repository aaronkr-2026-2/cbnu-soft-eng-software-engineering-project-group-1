import { Alert } from '@mui/material';
import { validateHours, validateOverrides } from '../../libs/workspace';
import { memberName, type PublicMember } from '../../libs/api/public-members';
import type { SelfProfile } from '../../libs/api/member';
import type { WorkspaceTask } from './WorkspaceReview';
import { useScheduleDraft } from './useScheduleDraft';
import { useSchedulePreview } from './useSchedulePreview';
import { DoctorApplications } from './DoctorApplications';
import { WeeklyHoursEditor } from './WeeklyHoursEditor';
import { DateOverridesEditor } from './DateOverridesEditor';
import { SchedulePreview } from './SchedulePreview';

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
  const draft = useScheduleDraft(zone);
  const {
    doctorId,
    weekly,
    overrides,
    date,
    setDoctorId,
    setWeekly,
    setOverrides,
    setWeeklyAck,
    setDateAck,
  } = draft;
  const doctor = team.find(
    (row) => row._id === doctorId && row.doctorClinicStatus === 'APPROVED',
  );
  const specialty = doctor?.doctorSpecializations?.[0];
  const preview = useSchedulePreview({
    mode,
    doctorId,
    doctor,
    specialty,
    date,
    profile,
    refresh,
  });
  if (mode === 'team')
    return (
      <DoctorApplications
        profile={profile}
        team={team}
        locked={locked}
        review={review}
      />
    );
  const weeklyError = validateHours(weekly),
    overrideError = validateOverrides(overrides, date);
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
      <WeeklyHoursEditor
        draft={draft}
        doctor={doctor}
        zone={zone}
        locked={locked}
        review={review}
        weeklyError={weeklyError}
      />
      <DateOverridesEditor
        draft={draft}
        doctor={doctor}
        zone={zone}
        locked={locked}
        review={review}
        overrideError={overrideError}
      />
      <SchedulePreview
        state={preview}
        doctor={doctor}
        date={date}
        zone={zone}
      />
    </section>
  );
}
