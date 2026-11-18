// Capture only the backend's fixed fragment format; never persist the bearer token.
export function captureRecoveryToken(location: { hash: string }, history: { replaceState(data: unknown, unused: string, url: string): void }): string {
  const fragment = location.hash;
  history.replaceState(null, '', '/reset-password');
  return /^#token=([A-Za-z0-9_-]{43})$/.exec(fragment)?.[1] || '';
}
export class RecoveryProblem extends Error {}
export function recoveryFailure(error: unknown, reset: boolean, aborted: boolean): string {
  if (error instanceof RecoveryProblem) return error.message;
  if (aborted) return reset ? 'We could not confirm the reset. Try signing in or request a new link.' : 'The request timed out. Retry to check the same request.';
  return 'Recovery is temporarily unavailable. Please try again.';
}
