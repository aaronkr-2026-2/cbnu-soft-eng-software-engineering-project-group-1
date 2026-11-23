import { useEffect, useState } from 'react';
import type { NextRouter } from 'next/router';
import type { Commitment, CommitmentKind } from '../../types/booking';
import { detail } from '../../libs/api/booking';
import { commitment, idPattern, replaceable } from '../../libs/booking';

export function useReplacementSource(router: NextRouter, retry: number) {
  const replacing =
    typeof router.query.replaceId === 'string' &&
    (router.query.replaceKind === 'APPOINTMENT' ||
      router.query.replaceKind === 'WAITLIST');
  const [original, setOriginal] = useState<Commitment>();
  const [sourceError, setSourceError] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  useEffect(() => {
    setOriginal(undefined);
    setSourceError('');
    setSourceLoading(false);
    if (!replacing) return;
    const id = String(router.query.replaceId),
      kind = router.query.replaceKind as CommitmentKind;
    if (!idPattern.test(id)) {
      setSourceError(
        'This replacement link is invalid. Keep the original and return to My Care.',
      );
      return;
    }
    const controller = new AbortController();
    setSourceLoading(true);
    void detail(kind, id, controller.signal)
      .then((row) => {
        if (controller.signal.aborted) return;
        const source = commitment(kind, row);
        if (!replaceable(source)) {
          setSourceError(
            'That commitment changed or is no longer replaceable. Keep it and refresh My Care.',
          );
          return;
        }
        setOriginal(source);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSourceError(
            'We could not verify the original commitment. Keep it and refresh My Care.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSourceLoading(false);
      });
    return () => controller.abort();
  }, [replacing, router.query.replaceId, router.query.replaceKind, retry]);
  return {
    replacing,
    original,
    setOriginal,
    sourceError,
    setSourceError,
    sourceLoading,
  };
}
