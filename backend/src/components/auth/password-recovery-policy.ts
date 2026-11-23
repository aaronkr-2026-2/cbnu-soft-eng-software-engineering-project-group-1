import { configurationFor } from '../../libs/config/application-config.service.js';
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

export function recoveryWebOrigin(
  env?: { PASSWORD_RESET_WEB_ORIGIN?: string; NODE_ENV?: string },
): string { return configurationFor(env).recoveryOrigin; }

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
