import { emailRateLimit } from './email-rate-limit.js';
export function emailVerificationRateLimit(limit: number) {
  return emailRateLimit(limit, 'EMAIL_VERIFICATION_THROTTLED');
}
