import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RecoveryReason } from '../../libs/types/password-recovery.types.js';

export function recoveryError(status: 400 | 429 | 503, reason: RecoveryReason) {
  return new HttpException(
    {
      statusCode: status,
      reason,
      message: {
        INVALID_REQUEST: 'Invalid request data',
        PASSWORD_RECOVERY_INVALID:
          'This reset link is invalid or expired; request a new link',
        PASSWORD_RECOVERY_THROTTLED: 'Please wait before trying again',
        PASSWORD_RECOVERY_UNAVAILABLE:
          'Password recovery is temporarily unavailable',
      }[reason],
    },
    status,
  );
}

@Catch(HttpException)
export class RecoveryErrorFilter implements ExceptionFilter {
  catch(error: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    // Rebuild the allowlist instead of forwarding arbitrary exception payloads.
    const body = error.getResponse();
    const candidate =
      typeof body === 'object' && body && 'reason' in body ? body.reason : '';
    const status = error.getStatus();
    const safeStatus = status === 400 || status === 429 ? status : 503;
    const reason: RecoveryReason =
      candidate === 'PASSWORD_RECOVERY_INVALID' ||
      candidate === 'PASSWORD_RECOVERY_THROTTLED' ||
      candidate === 'PASSWORD_RECOVERY_UNAVAILABLE'
        ? candidate
        : safeStatus === 503
          ? 'PASSWORD_RECOVERY_UNAVAILABLE'
          : 'INVALID_REQUEST';
    response
      .status(safeStatus)
      .json(recoveryError(safeStatus, reason).getResponse());
  }
}
