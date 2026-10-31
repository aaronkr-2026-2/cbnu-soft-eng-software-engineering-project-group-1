import { useEffect, useState } from 'react';
import { notificationPages, notificationContext } from '../api/notification';
import { BookingError } from '../api/booking';
import type {
  NotificationPage,
  NotificationContext,
} from '../../types/notification';
function useNoticePolling<T>(
  key: string,
  refresh: number,
  read: (signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<{
    key: string;
    data?: T;
    status: 'loading' | 'live' | 'paused' | 'retrying' | 'blocked';
    error: string;
    checkedAt?: number;
  }>({ key: '', status: 'loading', error: '' });
  useEffect(() => {
    let stopped = false,
      generation = 0,
      controller: AbortController | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      failures = 0;
    setState((previous) =>
      previous.key === key
        ? { ...previous, status: 'loading', error: '' }
        : { key, status: 'loading', error: '' },
    );
    async function load() {
      clearTimeout(timer);
      if (stopped) return;
      if (document.hidden || !navigator.onLine) {
        setState((previous) => ({
          ...previous,
          status: 'paused',
          error: navigator.onLine
            ? 'Updates paused while this tab is hidden.'
            : 'You are offline. Reconnect to refresh your notifications.',
        }));
        return;
      }
      const run = ++generation;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      let seconds = 15;
      try {
        const data = await read(signal);
        if (stopped || run !== generation) return;
        failures = 0;
        setState({
          key,
          data,
          status: 'live',
          error: '',
          checkedAt: Date.now(),
        });
      } catch (reason) {
        if (signal.aborted || stopped || run !== generation) return;
        const blocked =
          reason instanceof BookingError &&
          ['FORBIDDEN', 'UNAUTHENTICATED', 'NOT_FOUND'].includes(reason.code);
        if (blocked) seconds = 0;
        else seconds = Math.min(60, 5 * 2 ** Math.min(failures++, 4));
        setState((previous) => ({
          ...previous,
          ...(blocked ? { data: undefined } : {}),
          status: blocked ? 'blocked' : 'retrying',
          error: blocked
            ? 'These notifications are unavailable for this account.'
            : 'Could not refresh notifications. Retrying; previously shown notices may be out of date.',
        }));
      } finally {
        if (!stopped && generation === run && !signal.aborted && seconds)
          timer = setTimeout(() => void load(), seconds * 1000);
      }
    }
    function resync() {
      generation++;
      controller?.abort();
      clearTimeout(timer);
      void load();
    }
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);
    window.addEventListener('offline', resync);
    void load();
    return () => {
      stopped = true;
      generation++;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
      window.removeEventListener('offline', resync);
    };
    // The key encodes every input to the read function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refresh]);
  return state.key === key
    ? state
    : { key, status: 'loading' as const, error: '' };
}

export function useNotifications(
  unreadOnly: boolean,
  pages: number,
  refresh: number,
) {
  return useNoticePolling<NotificationPage>(
    `list:${unreadOnly}:${pages}`,
    refresh,
    (signal) => notificationPages(unreadOnly, pages, signal),
  );
}
export function useNoticeContext(id: string, refresh: number) {
  return useNoticePolling<NotificationContext>(
    `context:${id}`,
    refresh,
    (signal) => notificationContext(id, signal),
  );
}
