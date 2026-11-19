import { createHash, randomBytes } from 'node:crypto';
import {
  DAY,
  MINUTE,
  EMAIL_REQUEST_IP_LIMIT,
  EMAIL_CONFIRM_IP_LIMIT,
} from './email-send-policy.js';
import { emailRateLimit } from './email-rate-limit.js';

export {
  countSend,
  resetInactive,
  seconds,
  DAY,
  HOUR,
  MINUTE,
  LEASE,
} from './email-send-policy.js';
export const RECOVERY_LIFETIME = 10 * MINUTE;
export const RECOVERY_RETENTION = DAY;
export const RECOVERY_MAX_DELIVERY_ATTEMPTS = 3;
export const RECOVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const newRecoveryToken = () => randomBytes(32).toString('base64url');
export const recoveryTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const recoveryRequestRateLimit = () =>
  emailRateLimit(EMAIL_REQUEST_IP_LIMIT, 'PASSWORD_RECOVERY_THROTTLED');
export const recoveryResetRateLimit = () =>
  emailRateLimit(EMAIL_CONFIRM_IP_LIMIT, 'PASSWORD_RECOVERY_THROTTLED');

// Used only when recovery is explicitly configured/called, not during app startup.
export function recoveryWebOrigin(
  env: { PASSWORD_RESET_WEB_ORIGIN?: string; NODE_ENV?: string } = process.env,
): string {
  const raw = env.PASSWORD_RESET_WEB_ORIGIN?.trim();
  if (!raw) throw new Error('Password recovery origin is unavailable');
  try {
    const url = new URL(raw);
    const local =
      env.NODE_ENV === 'development' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      raw !== url.origin
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error('Password recovery origin is unavailable');
  }
}

export function recoveryLink(
  token: string,
  env?: Parameters<typeof recoveryWebOrigin>[0],
) {
  if (!RECOVERY_TOKEN_PATTERN.test(token))
    throw new Error('Invalid recovery token');
  return `${recoveryWebOrigin(env)}/reset-password#token=${token}`;
}

export function recoveryTokenIsCurrent(
  record: { expiresAt: Date; consumedAt?: Date; authVersion: number },
  authVersion: number,
  now: Date,
) {
  return (
    !record.consumedAt &&
    +now < +record.expiresAt &&
    record.authVersion === authVersion
  );
}
