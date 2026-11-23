import { Button } from '@mui/material';
import { displayUsername } from '../../libs/username';
import { label } from '../../libs/booking';
import { memberName, type PublicMember } from '../../libs/api/public-members';
import type { SelfProfile } from '../../libs/api/member';
import { clinicTeam, reviewDoctor } from '../../libs/api/workspace';
import type { WorkspaceTask } from './WorkspaceReview';

export function DoctorApplications({
  profile,
  team,
  locked,
  review,
}: {
  profile: SelfProfile;
  team: PublicMember[];
  locked: boolean;
  review: (task: WorkspaceTask) => void;
}) {
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
                            {profile.clinicName ||
                              displayUsername(profile.memberNick)}
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
}
