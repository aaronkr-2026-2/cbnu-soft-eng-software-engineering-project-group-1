import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Alert, Button, TextField } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import FavoriteBorderRounded from '@mui/icons-material/FavoriteBorderRounded';
import {
  authenticate,
  type AuthResult,
  type SignupInput,
} from '../../libs/api/auth';
import { startSession, useSession } from '../../libs/auth-session';
import { PasswordField } from './PasswordField';
import { GoogleSignIn } from './GoogleSignIn';

type Fields = {
  email: string;
  password: string;
  confirm: string;
  fullName: string;
  nickname: string;
  phone: string;
};
const emptyFields: Fields = {
  email: '',
  password: '',
  confirm: '',
  fullName: '',
  nickname: '',
  phone: '',
};

export function AuthPage() {
  const router = useRouter();
  const session = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fields, setFields] = useState(emptyFields);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>(
    {},
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const googleBusy = useRef(false);
  const busy = pending || googlePending;
  const request = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const signup = mode === 'signup';

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    heading.current?.focus();
  }, [mode]);

  function switchMode() {
    if (request.current || googleBusy.current) return;
    setMode(signup ? 'signin' : 'signup');
    setFields((previous) => ({ ...previous, password: '', confirm: '' }));
    setErrors({});
    setError('');
  }

  function update(key: keyof Fields, value: string) {
    setFields((previous) =>
      previous[key] === value ? previous : { ...previous, [key]: value },
    );
    setErrors((previous) =>
      previous[key] ? { ...previous, [key]: undefined } : previous,
    );
    setError('');
  }

  function googleBusyChanged(value: boolean) {
    googleBusy.current = value;
    setGooglePending(value);
  }

  async function completeSignIn(result: AuthResult) {
    startSession(result);
    setFields((previous) => ({ ...previous, password: '', confirm: '' }));
    // Fixed internal destination; no user-supplied redirect URL.
    await router.replace('/');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || googleBusy.current) return;
    const nextErrors: typeof errors = {};
    const email = fields.email.trim().toLowerCase();
    const length = (value: string) => Array.from(value).length;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || length(email) > 254)
      nextErrors.email = 'Enter a valid email address.';
    if (
      length(fields.password) < (signup ? 8 : 1) ||
      length(fields.password) > (signup ? 100 : 128)
    )
      nextErrors.password = signup
        ? 'Use 8–100 characters.'
        : 'Enter your password (up to 128 characters).';
    if (signup) {
      if (
        length(fields.nickname.trim()) < 2 ||
        length(fields.nickname.trim()) > 40
      )
        nextErrors.nickname = 'Use 2–40 characters.';
      if (length(fields.fullName.trim()) > 100)
        nextErrors.fullName = 'Use up to 100 characters.';
      if (!/^\+[1-9]\d{7,14}$/.test(fields.phone.trim()))
        nextErrors.phone = 'Include a country code, for example +821012345678.';
      if (fields.confirm !== fields.password)
        nextErrors.confirm = 'Passwords must match.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const first = Object.keys(nextErrors)[0];
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${first}"]`)
        ?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    const input = { memberEmail: email, memberPassword: fields.password };
    try {
      const result = await authenticate(
        mode,
        signup
          ? ({
              ...input,
              memberType: 'USER',
              memberNick: fields.nickname.trim(),
              memberPhone: fields.phone.trim(),
              ...(fields.fullName.trim()
                ? { memberFullName: fields.fullName.trim() }
                : {}),
            } satisfies SignupInput)
          : input,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      await completeSignIn(result);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : 'We couldn’t sign you in. Please try again.',
        );
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setPending(false);
      }
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel" aria-label="Welcome to MedConnect">
        <Link href="/" className="auth-logo">
          <Image
            src="/logo.png"
            alt="MedConnect home"
            width={200}
            height={74}
            priority
          />
        </Link>
        <div className="auth-brand-copy">
          <span className="auth-eyebrow">CARE STARTS WITH A CONNECTION</span>
          <h2>
            A little closer
            <br />
            to better care.
          </h2>
          <p>
            Your next step starts with a connection.
            <br />
            Let’s make it a good one.
          </p>
          <div className="auth-brand-symbol" aria-hidden="true">
            <FavoriteBorderRounded />
          </div>
        </div>
        <span className="auth-brand-footer">
          For your health. At your pace.
        </span>
      </section>
      <section className="auth-form-panel" aria-labelledby="auth-heading">
        <Link href="/" className="auth-back">
          <ArrowBackRounded />
          Back to home
        </Link>
        <div className="auth-form-container">
          <span className="auth-eyebrow">
            {signup ? 'YOUR CARE JOURNEY STARTS HERE' : 'GOOD TO SEE YOU AGAIN'}
          </span>
          <h1 id="auth-heading" tabIndex={-1} ref={heading}>
            {signup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="auth-intro">
            {signup
              ? 'A few details to create your patient account.'
              : 'Sign in to your MedConnect account.'}
          </p>
          {session ? (
            <Alert
              severity="success"
              action={
                <Button component={Link} href="/">
                  Go home
                </Button>
              }
            >
              You’re signed in as {session.member.memberNick}.
            </Alert>
          ) : (
            <>
              {error && (
                <Alert severity="error" className="auth-error">
                  {error}
                </Alert>
              )}
              <form ref={form} onSubmit={submit} noValidate aria-busy={busy}>
                {signup && (
                  <div className="auth-name-fields">
                    <TextField
                      id="fullName"
                      name="fullName"
                      label="Full name (optional)"
                      value={fields.fullName}
                      onChange={(event) =>
                        update('fullName', event.target.value)
                      }
                      autoComplete="name"
                      disabled={busy}
                      error={!!errors.fullName}
                      helperText={errors.fullName}
                      fullWidth
                    />
                    <TextField
                      id="nickname"
                      name="nickname"
                      label="Nickname"
                      value={fields.nickname}
                      onChange={(event) =>
                        update('nickname', event.target.value)
                      }
                      autoComplete="nickname"
                      disabled={busy}
                      error={!!errors.nickname}
                      helperText={errors.nickname || '2–40 characters'}
                      required
                      fullWidth
                    />
                  </div>
                )}
                <TextField
                  id="email"
                  name="email"
                  label="Email address"
                  type="email"
                  value={fields.email}
                  onChange={(event) => update('email', event.target.value)}
                  autoComplete="email"
                  disabled={busy}
                  error={!!errors.email}
                  helperText={errors.email}
                  required
                  fullWidth
                />
                {signup && (
                  <TextField
                    id="phone"
                    name="phone"
                    label="Phone number"
                    type="tel"
                    value={fields.phone}
                    onChange={(event) => update('phone', event.target.value)}
                    autoComplete="tel"
                    placeholder="+821012345678"
                    disabled={busy}
                    error={!!errors.phone}
                    helperText={errors.phone || 'Include your country code.'}
                    required
                    fullWidth
                  />
                )}
                <PasswordField
                  key={`${mode}-password`}
                  id="password"
                  label="Password"
                  value={fields.password}
                  onChange={(event) => update('password', event.target.value)}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  disabled={busy}
                  error={!!errors.password}
                  helperText={
                    errors.password || (signup ? '8–100 characters' : undefined)
                  }
                  maxLength={signup ? 200 : 256}
                />
                {signup && (
                  <PasswordField
                    id="confirm"
                    label="Confirm password"
                    value={fields.confirm}
                    onChange={(event) => update('confirm', event.target.value)}
                    autoComplete="new-password"
                    disabled={busy}
                    error={!!errors.confirm}
                    helperText={errors.confirm}
                    maxLength={200}
                  />
                )}
                <Button
                  className="auth-submit"
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={busy}
                  endIcon={!pending && <ArrowForwardRounded />}
                >
                  {pending
                    ? signup
                      ? 'Creating your account…'
                      : 'Signing in…'
                    : signup
                      ? 'Create account'
                      : 'Sign in'}
                </Button>
              </form>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <div className="auth-alternatives">
                <GoogleSignIn
                  disabled={pending}
                  onBusyChange={googleBusyChanged}
                  onSuccess={completeSignIn}
                />
                <div className="auth-switch">
                  <span>
                    {signup ? 'Already a member?' : 'New to MedConnect?'}
                  </span>
                  <Button
                    onClick={switchMode}
                    disabled={busy}
                    endIcon={<ArrowForwardRounded />}
                  >
                    {signup ? 'Sign in' : 'Sign up'}
                  </Button>
                </div>
              </div>
            </>
          )}
          <p className="auth-bottom-note">
            A connection today. A healthier tomorrow.
          </p>
        </div>
      </section>
    </main>
  );
}
