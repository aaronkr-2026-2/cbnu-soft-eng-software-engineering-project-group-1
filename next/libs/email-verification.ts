import { requestEmailCode, verifyEmailCode } from './api/email-verification';
import { SessionError } from './api/session';
import { verificationMessage } from './email-verification-contract';
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const validEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)) &&
  Array.from(normalizeEmail(email)).length <= 254;
export const remainingSeconds = (deadline: number, now = Date.now()) =>
  Math.max(0, Math.ceil((deadline - now) / 1000));
export function retryLabel(seconds: number) {
  if (seconds >= 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}
export interface EmailVerificationState {
  email: string;
  status: 'idle' | 'sending' | 'code' | 'verifying' | 'verified';
  challengeId?: string;
  codeExpiresAt: number;
  proof?: string;
  proofExpiresAt: number;
  nextSendAt: number;
  nextVerifyAt: number;
  uncertainRequestId?: string;
  exhausted: boolean;
  message: string;
  error: boolean;
}
const idle = (email = ''): EmailVerificationState => ({
  email,
  status: 'idle',
  codeExpiresAt: 0,
  proofExpiresAt: 0,
  nextSendAt: 0,
  nextVerifyAt: 0,
  exhausted: false,
  message: '',
  error: false,
});
// One instance per form, with no persistence or session writes. Revisions fence
// obsolete responses even when a transport ignores AbortSignal.
export class EmailVerification {
  private state = idle();
  private revision = 0;
  private request?: AbortController;
  private listeners = new Set<() => void>();
  constructor(
    private readonly sendCode = requestEmailCode,
    private readonly confirmCode = verifyEmailCode,
    private readonly now = Date.now,
    private readonly uuid = () => crypto.randomUUID(),
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: EmailVerificationState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  cancel = () => {
    this.revision++;
    this.request?.abort();
    this.request = undefined;
  };
  reset = () => {
    this.cancel();
    this.publish(idle());
  };
  edit = (email: string) => {
    email = normalizeEmail(email);
    if (email !== this.state.email) {
      this.cancel();
      this.publish(idle(email));
    }
  };
  busy = () => !!this.request;
  token(email: string) {
    return this.state.email === normalizeEmail(email) &&
      this.state.status === 'verified' &&
      this.state.proofExpiresAt > this.now()
      ? this.state.proof
      : undefined;
  }
  rejectProof = () => {
    this.cancel();
    this.publish({
      ...this.state,
      status: 'idle',
      proof: undefined,
      proofExpiresAt: 0,
      challengeId: undefined,
      message:
        'Your email verification has expired. Request a new code and verify again.',
      error: true,
    });
  };
  tick = () => {
    if (this.state.proof && this.state.proofExpiresAt <= this.now())
      this.rejectProof();
    else if (
      this.state.challengeId &&
      !this.state.proof &&
      this.state.codeExpiresAt <= this.now() &&
      !this.request
    )
      this.publish({
        ...this.state,
        status: 'idle',
        challengeId: undefined,
        message: 'This code has expired. Request a new code.',
        error: true,
      });
  };
  async send(email: string, retry = false) {
    this.edit(email);
    if (this.request) return;
    if (!validEmail(email)) {
      this.publish({
        ...this.state,
        message: 'Enter a valid email address first.',
        error: true,
      });
      return;
    }
    if (this.state.nextSendAt > this.now()) return;
    const requestId =
      retry && this.state.uncertainRequestId
        ? this.state.uncertainRequestId
        : this.uuid();
    const revision = this.revision;
    const controller = new AbortController();
    this.request = controller;
    this.publish({
      ...this.state,
      status: 'sending',
      proof: undefined,
      proofExpiresAt: 0,
      uncertainRequestId: undefined,
      message: 'Sending your code…',
      error: false,
    });
    try {
      const result = await this.sendCode(
        this.state.email,
        requestId,
        controller.signal,
      );
      if (revision !== this.revision || controller.signal.aborted) return;
      const now = this.now();
      this.publish({
        ...this.state,
        status: 'code',
        challengeId: result.challengeId,
        codeExpiresAt: now + result.expiresInSeconds * 1000,
        nextSendAt: now + result.retryAfterSeconds * 1000,
        nextVerifyAt: 0,
        exhausted: false,
        message: 'Check your inbox for the six-digit code.',
        error: false,
      });
    } catch (error) {
      if (revision !== this.revision || controller.signal.aborted) return;
      const detail = error instanceof SessionError ? error : undefined;
      const uncertain = !detail || detail.status === 503;
      this.publish({
        ...this.state,
        status: this.state.challengeId ? 'code' : 'idle',
        uncertainRequestId: uncertain ? requestId : undefined,
        nextSendAt: Math.max(
          this.state.nextSendAt,
          this.now() +
            (detail?.retryAfterSeconds ??
              (uncertain ? 30 : detail?.status === 429 ? 60 : 0)) *
              1000,
        ),
        message:
          detail?.verificationReason === 'EMAIL_VERIFICATION_INVALID'
            ? 'That send can no longer be recovered. Request a new code.'
            : verificationMessage(detail?.verificationReason),
        error: true,
      });
    } finally {
      if (revision === this.revision) this.request = undefined;
    }
  }
  async verify(code: string) {
    if (this.request || this.state.proof) return;
    if (!this.state.challengeId || this.state.codeExpiresAt <= this.now()) {
      this.tick();
      return;
    }
    if (this.state.exhausted || this.state.nextVerifyAt > this.now()) return;
    if (!/^[0-9]{6}$/.test(code)) {
      this.publish({
        ...this.state,
        message: 'Enter the six-digit code from your email.',
        error: true,
      });
      return;
    }
    const revision = this.revision;
    const controller = new AbortController();
    this.request = controller;
    this.publish({
      ...this.state,
      status: 'verifying',
      message: 'Verifying your email…',
      error: false,
    });
    try {
      const result = await this.confirmCode(
        this.state.email,
        this.state.challengeId,
        code,
        controller.signal,
      );
      if (revision !== this.revision || controller.signal.aborted) return;
      this.publish({
        ...this.state,
        status: 'verified',
        proof: result.emailVerificationToken,
        proofExpiresAt: this.now() + result.expiresInSeconds * 1000,
        uncertainRequestId: undefined,
        message: 'Email verified. You can now create your account.',
        error: false,
      });
    } catch (error) {
      if (revision !== this.revision || controller.signal.aborted) return;
      const detail = error instanceof SessionError ? error : undefined;
      this.publish({
        ...this.state,
        status: 'code',
        exhausted:
          detail?.verificationReason ===
          'EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED',
        nextVerifyAt: this.now() + (detail?.retryAfterSeconds ?? 0) * 1000,
        message:
          detail?.status === 503 || !detail
            ? 'We could not confirm verification. Try again; if the code was already used, request a new code.'
            : verificationMessage(detail.verificationReason),
        error: true,
      });
    } finally {
      if (revision === this.revision) this.request = undefined;
    }
  }
}
