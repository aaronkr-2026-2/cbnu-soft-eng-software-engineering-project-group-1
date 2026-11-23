// Shared, public contract only: safe for both browser and server imports.
const statuses = {
  INVALID_REQUEST: 400,
  EMAIL_VERIFICATION_INVALID: 400,
  EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED: 400,
  EMAIL_VERIFICATION_REQUIRED: 400,
  EMAIL_VERIFICATION_THROTTLED: 429,
  EMAIL_VERIFICATION_UNAVAILABLE: 503,
} as const;
export type VerificationReason = keyof typeof statuses;
export function verificationProblem(
  value: unknown,
  status: number,
): {
  verificationReason?: VerificationReason;
  retryAfterSeconds?: number;
} {
  if (!value || typeof value !== 'object') return {};
  const detail = value as Record<string, unknown>;
  const reason = detail.reason;
  if (
    typeof reason !== 'string' ||
    !Object.hasOwn(statuses, reason) ||
    statuses[reason as VerificationReason] !== status
  )
    return {};
  const retry = detail.retryAfterSeconds;
  return {
    verificationReason: reason as VerificationReason,
    ...((status === 429 || status === 503) &&
    typeof retry === 'number' &&
    Number.isFinite(retry) &&
    retry >= 0
      ? { retryAfterSeconds: Math.max(1, Math.min(86400, Math.ceil(retry))) }
      : {}),
  };
}
const opaque = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const duration = (value: unknown, max: number, min = 0): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
export interface EmailChallenge {
  challengeId: string;
  expiresInSeconds: number;
  retryAfterSeconds: number;
}
export interface EmailProof {
  emailVerificationToken: string;
  expiresInSeconds: number;
}
export function emailChallenge(value: unknown): EmailChallenge | undefined {
  const data = value as Partial<EmailChallenge> | null;
  if (
    !opaque(data?.challengeId) ||
    !duration(data?.expiresInSeconds, 600) ||
    !duration(data?.retryAfterSeconds, 86400)
  )
    return;
  return {
    challengeId: data.challengeId,
    expiresInSeconds: data.expiresInSeconds,
    retryAfterSeconds: data.retryAfterSeconds,
  };
}
export function emailProof(value: unknown): EmailProof | undefined {
  const data = value as Partial<EmailProof> | null;
  if (
    !opaque(data?.emailVerificationToken) ||
    !duration(data?.expiresInSeconds, 600, 1)
  )
    return;
  return {
    emailVerificationToken: data.emailVerificationToken,
    expiresInSeconds: data.expiresInSeconds,
  };
}
export const verificationMessage = (reason?: VerificationReason) =>
  ({
    INVALID_REQUEST: 'Check the email address and code, then try again.',
    EMAIL_VERIFICATION_INVALID:
      'The code is incorrect or has expired. Try again or request a new code.',
    EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED:
      'Too many incorrect codes. Request a new code when sending is available.',
    EMAIL_VERIFICATION_REQUIRED:
      'Verify your email before creating your account.',
    EMAIL_VERIFICATION_THROTTLED: 'Please wait before trying again.',
    EMAIL_VERIFICATION_UNAVAILABLE:
      'We could not confirm email delivery. Retry this send to recover it, or request a new code when available.',
  })[reason ?? 'EMAIL_VERIFICATION_UNAVAILABLE'];
