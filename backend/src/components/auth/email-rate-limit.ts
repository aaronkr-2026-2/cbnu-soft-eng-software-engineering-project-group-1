import type { RateLimitInfo } from 'express-rate-limit';
import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';
// The peer is Next's server for proxied traffic. No untrusted forwarded IPs.
// Both purposes use identical peer-IP attribution, window and response headers.
export function emailRateLimit(
  limit: number,
  reason: 'EMAIL_VERIFICATION_THROTTLED' | 'PASSWORD_RECOVERY_THROTTLED',
) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (request, response) => {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (((
            request as Request & { rateLimit?: RateLimitInfo }
          ).rateLimit?.resetTime?.getTime() ?? Date.now() + 60_000) -
            Date.now()) /
            1000,
        ),
      );
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Retry-After', String(retryAfterSeconds));
      response.status(429).json({
        statusCode: 429,
        reason,
        message: 'Please wait before trying again',
        retryAfterSeconds,
      });
    },
  });
}
