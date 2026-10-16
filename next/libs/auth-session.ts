import { useSyncExternalStore } from 'react';
import type { AuthResult } from './api/auth';

type Session = AuthResult & { expiresAt: number };
let session: Session | null = null;
let expirationTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const serverSnapshot = () => null;
const snapshot = () =>
  session && session.expiresAt > Date.now() ? session : null;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function clearSession() {
  clearTimeout(expirationTimer);
  session = null;
  listeners.forEach((listener) => listener());
}

export function startSession(result: AuthResult) {
  // Reading exp schedules UI expiry only; the backend still verifies all tokens.
  let expiresAt: number;
  try {
    const encoded = result.accessToken
      .split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded));
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp))
      throw new Error('Missing expiry');
    expiresAt = payload.exp * 1000;
    if (expiresAt <= Date.now() || expiresAt - Date.now() > 2147483647)
      throw new Error('Invalid expiry');
  } catch {
    throw new Error('We couldn’t start your session. Please sign in again.');
  }
  clearTimeout(expirationTimer);
  session = { ...result, expiresAt };
  expirationTimer = setTimeout(clearSession, expiresAt - Date.now());
  listeners.forEach((listener) => listener());
}

// Tokens remain in this client module, never browser storage or serialized props.
// Reload/expiry ends the local session. Sign-out does not revoke server sessions.
export function useSession() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
