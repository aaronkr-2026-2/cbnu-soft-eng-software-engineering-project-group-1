import { useEffect, useState, useSyncExternalStore } from 'react';
import { UsernameCheck } from './username-check';

export function useUsernameCheck(scope: string) {
  const [check] = useState(() => new UsernameCheck());
  const state = useSyncExternalStore(
    check.subscribe,
    check.snapshot,
    check.snapshot,
  );
  useEffect(() => {
    check.reset();
    return check.cancel;
  }, [check, scope]);
  return { check, state };
}
