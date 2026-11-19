import { useEffect, useState } from 'react';
import { publicMember } from '../api/booking';
import type { PublicMember } from '../api/public-members';
export function usePublicProfiles(ids: string[]) {
  const key = [...new Set(ids.filter(Boolean))].sort().join(',');
  const [profiles, setProfiles] = useState<Record<string, PublicMember>>({});
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled(
      key
        .split(',')
        .filter(Boolean)
        .map((id) => publicMember(id, controller.signal)),
    ).then((rows) => {
      if (controller.signal.aborted) return;
      const next: Record<string, PublicMember> = {};
      for (const row of rows)
        if (row.status === 'fulfilled') next[row.value._id] = row.value;
      setProfiles(next);
    });
    return () => controller.abort();
  }, [key]);
  return profiles;
}
