import { displayUsername } from '../../libs/username';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Alert, Button } from '@mui/material';
import { SiteHeader } from '../layout/SiteHeader';
import { SiteFooter } from '../layout/SiteFooter';
import {
  clearSession,
  getAccessToken,
  restoreSession,
  useSession,
  useSessionStatus,
} from '../../libs/auth-session';
import {
  fetchMyProfile,
  ProfileError,
  type SelfProfile,
} from '../../libs/api/member';
import { publicMember } from '../../libs/api/booking';
import { clinicTeam } from '../../libs/api/workspace';
import type { PublicMember } from '../../libs/api/public-members';
import { WorkspaceReview, type WorkspaceTask } from './WorkspaceReview';
import { LiveCalendar } from './LiveCalendar';
import { TeamSchedules } from './TeamSchedules';
import { StaffBooking } from './StaffBooking';
export function WorkspacePage() {
  return (
    <div className="landing site-shell care-page workspace-page">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="container care-main">
        <div className="care-heading">
          <span className="eyebrow">YOUR TEAM, CONNECTED</span>
          <h1>Your care workspace.</h1>
          <p>
            A shared calendar for your clinic and a focused view for each
            doctor.
          </p>
        </div>
        <WorkspaceGate />
      </main>
      <SiteFooter />
    </div>
  );
}
function WorkspaceGate() {
  const session = useSession(),
    status = useSessionStatus(),
    router = useRouter();
  if (session && ['CLINIC', 'DOCTOR'].includes(session.member.memberType))
    return <Workspace key={session.member._id} />;
  if (status === 'loading') return <p role="status">Restoring your session…</p>;
  if (session)
    return (
      <Alert severity="info">
        This workspace is for clinic and doctor accounts.{' '}
        <Button component={Link} href="/appointments">
          My Care
        </Button>
        <Button onClick={clearSession}>Sign out</Button>
      </Alert>
    );
  return (
    <div className="care-empty">
      <h2>Connect with your care team.</h2>
      <p>Sign in with your clinic or doctor account to open your workspace.</p>
      {status === 'error' && (
        <Button onClick={() => void restoreSession(true)}>Retry session</Button>
      )}
      <Button
        variant="contained"
        component={Link}
        href={`/auth?next=${encodeURIComponent(router.asPath)}`}
      >
        Sign in to workspace
      </Button>
    </div>
  );
}
function Workspace() {
  const [profile, setProfile] = useState<SelfProfile>(),
    [zone, setZone] = useState(''),
    [team, setTeam] = useState<PublicMember[]>([]),
    [error, setError] = useState(''),
    [teamError, setTeamError] = useState(''),
    [teamBusy, setTeamBusy] = useState(true),
    [epoch, setEpoch] = useState(0),
    [tab, setTab] = useState('calendar');
  const [task, setTask] = useState<WorkspaceTask>(),
    [reviewKey, setReviewKey] = useState(0),
    [open, setOpen] = useState(false),
    [locked, setLocked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void (async () => {
      const result = await fetchMyProfile(
        await getAccessToken(),
        controller.signal,
      );
      const timezone =
        result.memberType === 'CLINIC'
          ? result.clinicTimezone
          : result.clinicId
            ? (await publicMember(result.clinicId, controller.signal))
                .clinicTimezone
            : undefined;
      if (!timezone) throw new Error('Clinic timezone unavailable.');
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date());
      if (!controller.signal.aborted) {
        setProfile(result);
        setZone(timezone);
      }
    })().catch((reason) => {
      if (reason instanceof ProfileError && reason.code === 'UNAUTHENTICATED') {
        clearSession();
        return;
      }
      if (!controller.signal.aborted)
        setError(
          'We could not load your workspace profile and clinic timezone. Try again.',
        );
    });
    return () => controller.abort();
  }, [epoch]);
  useEffect(() => {
    if (profile?.memberType !== 'CLINIC') return;
    const controller = new AbortController();
    setTeamError('');
    setTeamBusy(true);
    void clinicTeam(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setTeam(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setTeamError(
            'Could not load your clinic doctors. Refresh to try again.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setTeamBusy(false);
      });
    return () => controller.abort();
  }, [profile?.memberType, epoch]);
  function review(next: WorkspaceTask) {
    if (locked) return;
    setTask(next);
    setReviewKey((value) => value + 1);
    setOpen(true);
  }
  function refresh() {
    setEpoch((value) => value + 1);
  }
  if (!profile || !zone)
    return error ? (
      <Alert
        severity="warning"
        action={<Button onClick={refresh}>Try again</Button>}
      >
        {error}
      </Alert>
    ) : (
      <p role="status">Loading your workspace…</p>
    );
  const clinic = profile.memberType === 'CLINIC';
  const tabs = clinic
    ? ['calendar', 'team', 'schedules', 'staff booking']
    : ['calendar'];
  return (
    <>
      <p className="care-meta">
        {profile.clinicName ||
          profile.memberFullName ||
          displayUsername(profile.memberNick)} ·
        All dates and times in {zone}
      </p>
      {error && <Alert severity="warning">{error}</Alert>}
      {clinic && teamBusy && <p role="status">Loading clinic doctors…</p>}
      {teamError && (
        <Alert
          severity="warning"
          action={<Button onClick={refresh}>Refresh team</Button>}
        >
          {teamError}
        </Alert>
      )}
      <nav className="workspace-tabs" aria-label="Workspace sections">
        {tabs.map((value) => (
          <Button
            key={value}
            variant={tab === value ? 'contained' : 'outlined'}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {value === 'team'
              ? 'Doctor applications'
              : value === 'staff booking'
                ? 'Phone / walk-in'
                : value.charAt(0).toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </nav>
      {locked && (
        <Alert severity="warning">
          A request has an uncertain result. New writes are paused on this
          screen.{' '}
          <Button onClick={() => setOpen(true)}>Check previous request</Button>
        </Alert>
      )}
      {tab === 'calendar' && (
        <LiveCalendar
          profile={profile}
          zone={zone}
          team={team}
          refresh={epoch}
          locked={locked}
          review={review}
          onTimezoneChange={setZone}
        />
      )}
      {clinic && (tab === 'team' || tab === 'schedules') && (
        <TeamSchedules
          key={tab}
          mode={tab}
          refresh={epoch}
          profile={profile}
          zone={zone}
          team={team}
          locked={locked || !!teamError || teamBusy}
          review={review}
        />
      )}
      {clinic && tab === 'staff booking' && (
        <StaffBooking
          clinicId={profile._id}
          zone={zone}
          team={team}
          locked={locked || !!teamError || teamBusy}
          review={review}
        />
      )}
      {task && (
        <WorkspaceReview
          key={reviewKey}
          task={task}
          open={open}
          onUncertain={() => setLocked(true)}
          onComplete={() => {
            setLocked(false);
            refresh();
          }}
          onClose={(pending) => {
            setOpen(false);
            if (!pending) setTask(undefined);
          }}
        />
      )}
    </>
  );
}
