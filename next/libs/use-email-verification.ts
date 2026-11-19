import { useEffect, useState, useSyncExternalStore } from 'react';
import { EmailVerification } from './email-verification';
export function useEmailVerification(scope: string) {
  const [check] = useState(() => new EmailVerification());
  const state = useSyncExternalStore(
    check.subscribe,
    check.snapshot,
    check.snapshot,
  );
  const [now, setNow] = useState(0);
  useEffect(() => {
    check.reset();
    setNow(Date.now());
    const interval = setInterval(() => {
      check.tick();
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(interval);
      check.cancel();
    };
  }, [check, scope]);
  return { check, state, now };
}
