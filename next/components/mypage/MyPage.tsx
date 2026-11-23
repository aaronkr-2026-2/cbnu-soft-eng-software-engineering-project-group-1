import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Alert, Button } from '@mui/material';
import {
  clearSession,
  currentSessionMemberId,
  useSession,
} from '../../libs/auth-session';
import { SiteHeader } from '../layout/SiteHeader';
import { SiteFooter } from '../layout/SiteFooter';
import { AccountDeletionDialog } from './AccountDeletionDialog';
import { PersonalInfo } from './PersonalInfo';

export function MyPage() {
  const session = useSession();
  const [notice, setNotice] = useState('');
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    if (deleting && session && session.member._id !== deleting)
      setDeleting(null);
  }, [deleting, session]);
  async function finishDeletion() {
    if (currentSessionMemberId() && currentSessionMemberId() !== deleting) {
      setDeleting(null);
      return true;
    }
    const cleared = await clearSession();
    if (!cleared) return false;
    if (currentSessionMemberId()) {
      setDeleting(null);
      return true;
    }
    setNotice('Your account has been deleted.');
    setDeleting(null);
    await router.replace('/account-deleted').catch(() => false);
    return true;
  }
  return (
    <div className="landing site-shell mypage">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="container mypage__main">
        <span className="eyebrow">YOUR ACCOUNT</span>
        <h1>My Page</h1>
        <p className="mypage__intro">
          Your personal details, all in one place.
        </p>
        {session ? (
          <PersonalInfo
            key={session.accessToken}
            token={session.accessToken}
            onDelete={(member) => {
              setNotice('');
              setDeleting(member._id);
            }}
            onSessionEnded={() => {
              setNotice('Your session has ended. Please sign in again.');
              clearSession();
            }}
          />
        ) : (
          <div className="mypage__card">
            <Alert severity="info">
              {notice || 'Sign in to view and edit your personal information.'}
            </Alert>
            <Button component={Link} href="/auth" variant="contained">
              Sign in
            </Button>
          </div>
        )}
      </main>
      <SiteFooter />
      {deleting && (
        <AccountDeletionDialog
          key={deleting}
          memberId={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={finishDeletion}
          onUncertain={() =>
            setNotice(
              'Account deletion could not be confirmed. Sign in to review your account status before making another request.',
            )
          }
        />
      )}
    </div>
  );
}
