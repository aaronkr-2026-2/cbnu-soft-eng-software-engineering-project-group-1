import { useSyncExternalStore } from 'react';
import type { AuthResult } from './api/auth';
import { sessionRequest, SessionError } from './api/session';
type Session = AuthResult & { expiresAt: number };
let session: Session | null = null;
let status: 'loading' | 'ready' | 'error' = 'loading';
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<Session | null> | undefined;
let generation = 0,
  initialized = false;
let channel: BroadcastChannel | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () =>
  session && session.expiresAt > Date.now() ? session : null;
function apply(result: AuthResult) {
  const payload = JSON.parse(
    atob(
      result.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'),
    ),
  );
  const expiresAt = Number(payload.exp) * 1000;
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now() ||
    expiresAt - Date.now() > 2147483647
  )
    throw new Error('Invalid session expiry');
  session = { ...result, expiresAt };
  status = 'ready';
  clearTimeout(timer);
  timer = setTimeout(
    () => {
      void restoreSession(true);
    },
    Math.max(1000, expiresAt - Date.now() - 60000),
  );
  emit();
}
export function startSession(result: AuthResult) {
  generation++;
  apply(result);
  channel?.postMessage('changed');
}
export function clearSession() {
  generation++;
  clearTimeout(timer);
  session = null;
  status = 'ready';
  emit();
  channel?.postMessage('logout');
  // The client transport serializes this after any in-flight refresh, so its
  // late Set-Cookie cannot restore the local session after sign-out.
  void sessionRequest('logout').catch(() => undefined);
}
export function restoreSession(force = false): Promise<Session | null> {
  if (pending) return pending;
  if (!force && snapshot()) return Promise.resolve(session);
  const current = generation;
  pending = sessionRequest<AuthResult>('refresh')
    .then((result) => {
      if (current === generation) apply(result);
      return snapshot();
    })
    .catch((error) => {
      if (current !== generation) return snapshot();
      if (error instanceof SessionError && [401, 403].includes(error.status)) {
        session = null;
        status = 'ready';
        clearTimeout(timer);
      } else {
        status = 'error';
        if (snapshot())
          timer = setTimeout(() => {
            void restoreSession(true);
          }, 5000);
        else session = null;
      }
      emit();
      return snapshot();
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
export function initializeSession() {
  if (initialized) return;
  initialized = true;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('medconnect-session');
    channel.onmessage = (event) => {
      if (event.data === 'logout') {
        generation++;
        clearTimeout(timer);
        session = null;
        status = 'ready';
        emit();
      } else if (event.data === 'changed') {
        generation++;
        clearTimeout(timer);
        session = null;
        status = 'loading';
        emit();
        void (pending || Promise.resolve()).then(() => restoreSession(true));
      }
    };
  }
  void restoreSession();
}
export async function getAccessToken() {
  if (!snapshot() || session!.expiresAt - Date.now() < 5000)
    await restoreSession(true);
  const token = snapshot()?.accessToken;
  if (!token) throw new SessionError(401);
  return token;
}
export function updateSessionMember(
  token: string,
  member: AuthResult['member'],
) {
  if (!session || session.accessToken !== token || !snapshot()) return;
  session = {
    ...session,
    member: {
      _id: member._id,
      memberType: member.memberType,
      memberNick: member.memberNick,
      memberFullName: member.memberFullName,
    },
  };
  emit();
}
export function useSession() {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
export function useSessionStatus() {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => 'loading' as const,
  );
}
