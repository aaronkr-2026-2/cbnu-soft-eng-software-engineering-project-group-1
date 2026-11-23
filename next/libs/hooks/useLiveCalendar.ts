import { useEffect, useState } from 'react';
import { calendarSnapshot, calendarUpdates } from '../api/workspace';
import { BookingError } from '../api/booking';
import type { CalendarRange, CalendarSnapshot } from '../../types/workspace';
type State = {
  key: string;
  snapshot?: CalendarSnapshot;
  status: 'loading' | 'live' | 'reconnecting' | 'paused' | 'blocked';
  error: string;
  updated?: number;
};
export function useLiveCalendar(
  range: CalendarRange | undefined,
  refresh: number,
) {
  const key = JSON.stringify(range);
  const [state, setState] = useState<State>({
    key: '',
    status: 'loading',
    error: '',
  });
  useEffect(() => {
    if (!range) return;
    let stopped = false,
      generation = 0,
      timer: ReturnType<typeof setTimeout> | undefined,
      controller: AbortController | undefined;
    let current: CalendarSnapshot | undefined,
      full = true,
      failures = 0;
    const update = (values: Partial<State>) => {
      if (!stopped) setState((previous) => ({ ...previous, ...values, key }));
    };
    setState({ key, status: 'loading', error: '' });
    async function poll() {
      clearTimeout(timer);
      if (stopped) return;
      if (document.hidden || !navigator.onLine) {
        update({
          status: 'paused',
          error: navigator.onLine
            ? 'Updates paused while this tab is hidden.'
            : 'You are offline. Reconnect to resync the calendar.',
        });
        return;
      }
      const run = ++generation;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      let seconds = 5;
      try {
        if (full || !current) {
          const snapshot = await calendarSnapshot(range!, signal);
          if (run !== generation || stopped) return;
          current = snapshot;
          full = false;
        } else {
          const result = await calendarUpdates(
            range!,
            current.revision,
            signal,
          );
          seconds = Math.max(5, Math.min(60, result.pollAfterSeconds || 5));
          if (result.changed) {
            const snapshot = await calendarSnapshot(range!, signal);
            if (run !== generation || stopped) return;
            current = snapshot;
          }
        }
        if (run !== generation || stopped) return;
        failures = 0;
        update({
          snapshot: current,
          status: 'live',
          error: '',
          updated: Date.now(),
        });
      } catch (error) {
        if (signal.aborted || run !== generation || stopped) return;
        full = true;
        if (
          error instanceof BookingError &&
          ['FORBIDDEN', 'UNAUTHENTICATED'].includes(error.code)
        ) {
          seconds = 0;
          current = undefined;
          update({
            snapshot: undefined,
            status: 'blocked',
            error:
              'Calendar access is unavailable for this session. Sign in with an authorized clinic or doctor account.',
          });
          return;
        }
        failures++;
        seconds = Math.min(30, 5 * 2 ** Math.min(failures - 1, 3));
        update({
          status: 'reconnecting',
          error:
            error instanceof Error
              ? error.message
              : 'Calendar unavailable. Reconnecting…',
        });
      } finally {
        if (!stopped && run === generation && !signal.aborted && seconds > 0)
          timer = setTimeout(() => void poll(), seconds * 1000);
      }
    }
    function resync() {
      generation++;
      controller?.abort();
      clearTimeout(timer);
      full = true;
      update({ status: current ? 'reconnecting' : 'loading' });
      void poll();
    }
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);
    window.addEventListener('offline', resync);
    void poll();
    return () => {
      stopped = true;
      generation++;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
      window.removeEventListener('offline', resync);
    };
    // The serialized range makes changes to scope/window replace the entire state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refresh]);
  return state.key === key
    ? state
    : { key, status: 'loading' as const, error: '' };
}
