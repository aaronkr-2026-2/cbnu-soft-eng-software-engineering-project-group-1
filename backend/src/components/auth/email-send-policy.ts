import type { EmailSendPolicyState } from '../../libs/types/email-send-policy.types.js';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const LEASE = 30_000;
export const EMAIL_REQUEST_IP_LIMIT = 10;
export const EMAIL_CONFIRM_IP_LIMIT = 30;
export const seconds = (deadline: Date, now: Date) =>
  Math.max(0, Math.ceil((+deadline - +now) / 1000));

export function resetInactive(limit: EmailSendPolicyState, now: Date) {
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

// Call once when a send is accepted or ambiguous, including recovered leases.
// Definitive failure preserves allowance; all attempts still affect spacing/activity.
export function countSend(limit: EmailSendPolicyState, acceptedAt: Date) {
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
