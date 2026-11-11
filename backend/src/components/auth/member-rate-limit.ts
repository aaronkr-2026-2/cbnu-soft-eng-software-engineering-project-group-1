import { rateLimit } from 'express-rate-limit';

// In-memory limits apply per API process. Use a shared store when scaling out.
export function memberRateLimit() {
  return rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many authentication requests; try again later',
    },
  });
}
