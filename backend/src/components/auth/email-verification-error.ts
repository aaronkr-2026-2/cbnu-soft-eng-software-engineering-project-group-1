import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
export function verificationError(
  status: number,
  reason: string,
  retryAfterSeconds?: number,
): HttpException {
  return new HttpException(
    {
      statusCode: status,
      reason,
      message:
        {
          INVALID_REQUEST: 'Invalid request',
          EMAIL_VERIFICATION_REQUIRED: 'Verify your email before signing up',
          EMAIL_VERIFICATION_INVALID:
            'Verification has expired or is invalid; request a new code',
          EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED:
            'Too many incorrect codes; request a new code',
          EMAIL_VERIFICATION_THROTTLED: 'Please wait before trying again',
          EMAIL_VERIFICATION_UNAVAILABLE:
            'Email verification is temporarily unavailable; retry shortly',
        }[reason] ?? 'Email verification failed',
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
    status,
  );
}
// Scoped to the affected REST paths, including validation failures.
@Catch(HttpException)
export class EmailVerificationFilter implements ExceptionFilter {
  catch(error: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = error.getResponse();
    response.setHeader('Cache-Control', 'no-store');
    if (typeof body === 'object' && body && 'retryAfterSeconds' in body)
      response.setHeader('Retry-After', String(body.retryAfterSeconds));
    response.status(error.getStatus()).json(body);
  }
}
