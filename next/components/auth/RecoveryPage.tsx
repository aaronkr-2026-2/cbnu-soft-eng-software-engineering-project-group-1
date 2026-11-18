import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { PasswordField } from './PasswordField';
import { captureRecoveryToken, RecoveryProblem, recoveryFailure } from '../../libs/password-recovery';
import { clearSession } from '../../libs/auth-session';

export function RecoveryPage({ reset = false }: { reset?: boolean }) {
  const token = useRef('');
  const captured = useRef(false);
  const requestId = useRef('');
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(!reset);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cleanupNeeded, setCleanupNeeded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (reset && !captured.current) {
      captured.current = true;
      token.current = captureRecoveryToken(window.location, window.history);
      setReady(!!token.current);
      if (!token.current) setError('This link is missing or invalid. Reopen your email or request a new link.');
    }
    // A new email link may navigate only the fragment of this same page.
    // Reload gives it fresh component state; fragments never enter the HTTP URL.
    const reopen = () => { if (reset) window.location.reload(); };
    window.addEventListener('hashchange', reopen);
    return () => { window.removeEventListener('hashchange', reopen); controller.current?.abort(); };
  }, [reset]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !ready) return;
    if (reset && ([...password].length < 8 || [...password].length > 100 || password !== confirm)) {
      setError('Enter matching passwords of 8–100 characters.'); return;
    }
    busy.current = true; setPending(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      if (!reset && !requestId.current) requestId.current = crypto.randomUUID();
      const response = await fetch(`/api/session/password-${reset ? 'reset' : 'request'}`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', 'X-MedConnect-Session': '1' },
        body: JSON.stringify(reset ? { token: token.current, newPassword: password, confirmPassword: confirm }
          : { memberEmail: email.trim().toLowerCase(), requestId: requestId.current }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.reason === 'PASSWORD_RECOVERY_INVALID') { token.current = ''; setReady(false); throw new RecoveryProblem('This link is expired or already used. Request a new link.'); }
        if (response.status === 429) throw new RecoveryProblem('Too many attempts. Please wait before trying again.');
        throw new RecoveryProblem(reset ? 'We could not confirm the reset. Try signing in or request a new link.' : 'Recovery is temporarily unavailable. Try again shortly.');
      }
      if (result?.[reset ? 'passwordChanged' : 'accepted'] !== true) throw new RecoveryProblem('Unexpected response. Please try again.');
      if (reset) { token.current = ''; setPassword(''); setConfirm(''); clearTimeout(timeout); setCleanupNeeded(!(await clearSession())); }
      setSuccess(true);
    } catch (failure) {
      setError(recoveryFailure(failure, reset, abort.signal.aborted));
    } finally { clearTimeout(timeout); busy.current = false; setPending(false); }
  }
  return <Container maxWidth="sm"><Box component="main" sx={{ py: { xs: 4, sm: 8 } }}>
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 4 } }}><Stack spacing={3}>
      <Link href="/">MedConnect</Link>
      <Typography component="h1" variant="h4">{reset ? 'Reset your password' : 'Forgot your password?'}</Typography>
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {success ? <>
        <Alert severity="success" role="status">{reset ? 'Password updated. Your previous sessions have been signed out. Sign in with your new password.' : 'If an eligible account exists, we’ll email a password reset link. It expires 10 minutes after your request.'}</Alert>
        {cleanupNeeded && <Alert severity="warning">Your password changed, but browser cookie cleanup could not be confirmed. <Button disabled={pending} onClick={async () => { setPending(true); try { setCleanupNeeded(!(await clearSession())); } finally { setPending(false); } }}>Retry sign-out cleanup</Button></Alert>}
        {!reset && <Button onClick={() => { requestId.current = ''; setSuccess(false); }}>Request another link</Button>}
      </> : <Stack component="form" spacing={3} onSubmit={submit} aria-busy={pending}>
        {reset ? <><PasswordField id="new-password" label="New password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" maxLength={200} disabled={pending || !ready} helperText="8–100 characters" />
          <PasswordField id="confirm-password" label="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" maxLength={200} disabled={pending || !ready} /></>
          : <TextField label="Email address" type="email" autoComplete="email" required value={email} disabled={pending} onChange={e => { setEmail(e.target.value); requestId.current = ''; }} slotProps={{ htmlInput: { maxLength: 254 } }} />}
        <Button variant="contained" type="submit" disabled={pending || !ready}>{pending ? 'Please wait…' : reset ? 'Save new password' : 'Send reset link'}</Button>
      </Stack>}
      {reset && <Link href="/forgot-password">Request a new reset link</Link>}
      <Link href={success && reset ? '/auth?passwordChanged=1' : '/auth'}>Back to sign in</Link>
    </Stack></Paper>
  </Box></Container>;
}
