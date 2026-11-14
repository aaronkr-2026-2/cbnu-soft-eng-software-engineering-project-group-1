import { useEffect, useRef, useState } from 'react';
import { Button, TextField } from '@mui/material';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import type { useEmailVerification } from '../../libs/use-email-verification';
import {
  remainingSeconds,
  retryLabel,
  validEmail,
} from '../../libs/email-verification';
type Props = {
  email: string;
  disabled: boolean;
  verification: ReturnType<typeof useEmailVerification>;
};
export function EmailVerification({
  email,
  disabled,
  verification: { check, state, now },
}: Props) {
  const [code, setCode] = useState('');
  const status = useRef<HTMLParagraphElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const busy = state.status === 'sending' || state.status === 'verifying';
  const verified = state.status === 'verified';
  // The interval may lag behind a freshly received deadline by part of a second.
  const clock = Math.max(now, Date.now());
  const wait = remainingSeconds(state.nextSendAt, clock);
  const verifyWait = remainingSeconds(state.nextVerifyAt, clock);
  useEffect(() => {
    setCode('');
    if (state.challengeId && !state.proof) codeInput.current?.focus();
  }, [state.challengeId, state.email]);
  useEffect(() => {
    if (verified) status.current?.focus();
  }, [verified]);
  async function send(retry = false) {
    await check.send(email, retry);
  }
  return (
    <div
      className="auth-email-verification"
      role="group"
      aria-label="Email verification"
      aria-busy={busy}
    >
      <div className="auth-email-actions">
        {verified ? (
          <span className="auth-email-verified">
            <CheckCircleOutlineRounded aria-hidden="true" /> Email verified
          </span>
        ) : (
          <Button
            type="button"
            variant="outlined"
            onClick={() => void send(!!state.uncertainRequestId)}
            disabled={disabled || busy || wait > 0 || !validEmail(email)}
          >
            {state.status === 'sending'
              ? 'Sending…'
              : state.uncertainRequestId
                ? 'Retry send'
                : state.challengeId
                  ? 'Resend code'
                  : 'Send code'}
          </Button>
        )}
        {state.uncertainRequestId && (
          <Button
            type="button"
            onClick={() => void send()}
            disabled={disabled || busy || wait > 0}
          >
            Send new code
          </Button>
        )}
      </div>
      {state.challengeId && !verified && (
        <div className="auth-email-code">
          <TextField
            id="email-code"
            name="emailCode"
            label="Verification code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputRef={codeInput}
            autoComplete="one-time-code"
            disabled={disabled || busy || state.exhausted}
            error={state.error}
            helperText="Enter all six digits, including any leading zeros."
            slotProps={{
              htmlInput: {
                inputMode: 'numeric',
                pattern: '[0-9]{6}',
                maxLength: 6,
                'aria-describedby':
                  'email-verification-status email-code-helper-text',
              },
            }}
            fullWidth
          />
          <Button
            type="button"
            variant="contained"
            disabled={
              disabled ||
              busy ||
              state.exhausted ||
              verifyWait > 0 ||
              !/^[0-9]{6}$/.test(code)
            }
            onClick={async () => {
              await check.verify(code);
              if (check.snapshot().error) codeInput.current?.focus();
            }}
          >
            {state.status === 'verifying' ? 'Verifying…' : 'Verify email'}
          </Button>
        </div>
      )}
      <p
        ref={status}
        tabIndex={-1}
        id="email-verification-status"
        className={
          state.error ? 'auth-email-status is-error' : 'auth-email-status'
        }
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {state.message || 'Verify your email before creating your account.'}
      </p>
      {verified && (
        <p className="auth-email-timing">
          Create your account within{' '}
          {retryLabel(remainingSeconds(state.proofExpiresAt, clock))}.
        </p>
      )}
      {state.challengeId && !verified && (
        <p className="auth-email-timing">
          Code expires in{' '}
          {retryLabel(remainingSeconds(state.codeExpiresAt, clock))}.
        </p>
      )}
      {wait > 0 && (
        <p className="auth-email-timing">
          Another code can be requested in {retryLabel(wait)}.
        </p>
      )}
      {verifyWait > 0 && (
        <p className="auth-email-timing">
          You can retry verification in {retryLabel(verifyWait)}.
        </p>
      )}
    </div>
  );
}
