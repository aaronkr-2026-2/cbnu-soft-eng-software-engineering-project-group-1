import { useEffect, useRef, useState } from 'react';
import { Button } from '@mui/material';
import Google from '@mui/icons-material/Google';
import {
  authenticate,
  getGoogleNonce,
  type AuthResult,
} from '../../libs/api/auth';
import { loadGoogleIdentity } from '../../libs/google-identity';

interface Props {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onSuccess: (result: AuthResult) => Promise<void>;
}

export function GoogleSignIn(props: Props) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'verifying' | 'error'
  >('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    let expired = false;
    let processing = false;
    let consumed = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const button = container.current;
    setStatus('loading');
    setError('');
    button?.replaceChildren();

    async function credentialReceived(credential?: string) {
      if (
        !active ||
        expired ||
        consumed ||
        processing ||
        callbacks.current.disabled
      )
        return;
      consumed = true;
      if (!credential) {
        setError(
          'Google did not return a sign-in credential. Please try again.',
        );
        setStatus('error');
        return;
      }
      processing = true;
      callbacks.current.onBusyChange(true);
      setStatus('verifying');
      try {
        const result = await authenticate(
          'google',
          { idToken: credential },
          controller.signal,
        );
        if (active) await callbacks.current.onSuccess(result);
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Google sign-in failed. Please try again.',
          );
          setStatus('error');
        }
      } finally {
        processing = false;
        if (active) callbacks.current.onBusyChange(false);
      }
    }

    Promise.all([loadGoogleIdentity(), getGoogleNonce(controller.signal)])
      .then(([google, nonce]) => {
        if (!active || !button) return;
        google.initialize({
          client_id: clientId,
          nonce,
          ux_mode: 'popup',
          auto_select: false,
          callback: (response) => {
            void credentialReceived(response.credential);
          },
        });
        google.renderButton(button, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 200,
        });
        setStatus('ready');
        // The backend's nonce lasts five minutes. Never use an idle stale challenge.
        expiry = setTimeout(
          () => {
            if (!active || processing) return;
            expired = true;
            setStatus('error');
            setError('Google sign-in timed out. Please try again.');
          },
          4 * 60 * 1000,
        );
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Google sign-in could not load.',
          );
          setStatus('error');
        }
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(expiry);
      button?.replaceChildren();
      if (processing) callbacks.current.onBusyChange(false);
    };
  }, [clientId, attempt]);

  return (
    <div
      className="auth-google"
      aria-busy={!!clientId && (status === 'loading' || status === 'verifying')}
    >
      <div
        className="auth-google-button"
        ref={container}
        hidden={status !== 'ready'}
        inert={props.disabled}
      />
      {(!clientId || status !== 'ready') && (
        <Button variant="outlined" disabled startIcon={<Google />}>
          {status === 'verifying' ? 'Signing in…' : 'Continue with Google'}
        </Button>
      )}
      {!clientId ? (
        <span>Google sign-in is unavailable</span>
      ) : status === 'loading' ? (
        <span role="status">Loading Google sign-in…</span>
      ) : null}
      {error && (
        <>
          <span role="alert">{error}</span>
          <Button
            onClick={() => setAttempt((value) => value + 1)}
            disabled={props.disabled}
            size="small"
          >
            Try again
          </Button>
        </>
      )}
    </div>
  );
}
