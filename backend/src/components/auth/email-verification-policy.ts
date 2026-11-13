import type { EmailSendLimit } from '../../libs/types/email-verification.types.js';
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const LIFETIME = 10 * MINUTE;
export const LEASE = 30_000;
export const seconds = (deadline: Date, now: Date) =>
  Math.max(0, Math.ceil((+deadline - +now) / 1000));
export function resetInactive(limit: EmailSendLimit, now: Date) {
  if (
    !limit.pending &&
    +limit.blockedUntil <= +now &&
    +limit.lastSendAttemptAt + DAY <= +now
  ) {
    limit.initialSent = false;
    limit.groupCount = 0;
    limit.blockLevel = 0;
    limit.blockedUntil = new Date(0);
  }
}
export function countSend(limit: EmailSendLimit, acceptedAt: Date) {
  if (!limit.initialSent) {
    limit.initialSent = true;
    return;
  }
  limit.groupCount++;
  if (limit.groupCount === 3) {
    limit.blockedUntil = new Date(
      +acceptedAt + [HOUR, 3 * HOUR, 5 * HOUR, DAY][limit.blockLevel],
    );
    limit.blockLevel = Math.min(3, limit.blockLevel + 1);
    limit.groupCount = 0;
  }
}
