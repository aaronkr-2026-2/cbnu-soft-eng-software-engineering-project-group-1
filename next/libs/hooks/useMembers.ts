import { useEffect, useState } from 'react';
import { fetchMembers, type PublicMember } from '../api/public-members';

export function useMembers(
  clinicId?: string,
  directory: 'clinics' | 'doctors' = 'clinics',
) {
  const [members, setMembers] = useState<PublicMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setMembers([]);
    fetchMembers(clinicId, controller.signal, directory)
      .then((data) => {
        if (!controller.signal.aborted) setMembers(data);
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [clinicId, directory, attempt]);

  return {
    members,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
