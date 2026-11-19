import { rateLimit } from 'express-rate-limit';

// Separate from authentication limits; shared across both username-check routes.
export function memberUsernameRateLimit() {
  return rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many username checks; try again later',
    },
    handler: (_request, response, _next, options) => {
      response.setHeader('Cache-Control', 'no-store');
      response.status(options.statusCode).json(options.message);
    },
  });
}
