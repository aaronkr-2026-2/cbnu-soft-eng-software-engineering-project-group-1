import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Alert, Button } from '@mui/material';
import {
  clearSession,
  restoreSession,
  useSession,
  useSessionStatus,
} from '../../libs/auth-session';
export function PatientGate({ children }: { children: ReactNode }) {
  const session = useSession(),
    status = useSessionStatus(),
    router = useRouter();
  if (session?.member.memberType === 'USER')
    return <div key={session.member._id}>{children}</div>;
  if (status === 'loading') return <p role="status">Restoring your session…</p>;
  if (session)
    return (
      <Alert severity="info">
        This area is for patient accounts.{' '}
        <Button onClick={clearSession}>Sign out</Button>
        <Button component={Link} href="/mypage">
          My Page
        </Button>
      </Alert>
    );
  return (
    <div className="care-empty">
      <h2>Keep your care together.</h2>
      <p>Sign in to book, join a waitlist, or view your commitments.</p>
      {status === 'error' && (
        <Alert severity="warning">
          We could not restore your session.{' '}
          <Button onClick={() => void restoreSession(true)}>
            Try restoring again
          </Button>
        </Alert>
      )}
      <Button
        variant="contained"
        component={Link}
        href={`/auth?next=${encodeURIComponent(router.asPath)}`}
      >
        Sign in to continue
      </Button>
    </div>
  );
}
