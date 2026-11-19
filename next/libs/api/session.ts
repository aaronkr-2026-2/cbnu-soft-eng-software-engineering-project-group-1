import {
  verificationProblem,
  type VerificationReason,
} from '../email-verification-contract';
import { isUsernameTaken } from '../username';
let queue: Promise<unknown> = Promise.resolve();
export class SessionError extends Error {
  constructor(
    readonly status: number,
    readonly usernameTaken = false,
    readonly verificationReason?: VerificationReason,
    readonly retryAfterSeconds?: number,
  ) {
    super('Session unavailable');
  }
}
export function sessionRequest<T>(
  action: string,
  body: object = {},
  signal?: AbortSignal,
): Promise<T> {
  const request = async () => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timeout = setTimeout(abort, 15000);
    try {
      const response = await fetch(`/api/session/${action}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-MedConnect-Session': '1',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        const problem = ['signup', 'email-request', 'email-verify'].includes(
          action,
        )
          ? verificationProblem(detail, response.status)
          : {};
        throw new SessionError(
          response.status,
          action === 'signup' && isUsernameTaken(detail),
          problem.verificationReason,
          problem.retryAfterSeconds,
        );
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
  const run = async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks)
      return await navigator.locks.request('medconnect-session', request);
    return await request();
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
