import { usernameError } from '../username';

export type UsernameStatus = 'AVAILABLE' | 'TAKEN' | 'INVALID';
export class UsernameCheckError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}
export async function checkUsername(
  memberNick: string,
  signal: AbortSignal,
  token?: string,
): Promise<UsernameStatus> {
  const invalid = usernameError(memberNick);
  if (invalid) return 'INVALID';
  const base =
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim().replace(/\/graphql\/?$/, '');
  if (!base)
    throw new UsernameCheckError(
      'Username checks are temporarily unavailable.',
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(
      `${base.replace(/\/$/, '')}/member/username/availability${token ? '/me' : ''}`,
      {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ memberNick: memberNick.trim() }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: 'Your session has ended. Sign in again to check your username.',
        429: 'Too many checks. Wait a moment and try again.',
      };
      throw new UsernameCheckError(
        messages[response.status] ||
          'Could not check availability. Please try again.',
        response.status,
      );
    }
    const result = await response.json();
    if (
      !['AVAILABLE', 'TAKEN', 'INVALID'].includes(result?.status) ||
      result.available !== (result.status === 'AVAILABLE')
    )
      throw new UsernameCheckError(
        'Could not read availability. Please try again.',
      );
    return result.status;
  } catch (error) {
    if (error instanceof UsernameCheckError) throw error;
    throw new UsernameCheckError(
      'Could not check availability. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
