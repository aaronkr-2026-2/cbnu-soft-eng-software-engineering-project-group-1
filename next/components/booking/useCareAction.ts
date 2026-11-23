import { useEffect, useRef, useState } from 'react';
import type {
  Action,
  BookingProblem,
  Receipt,
  RecordItem,
} from '../../types/booking';
import {
  BookingError,
  detail,
  execute,
  targetRecords,
} from '../../libs/api/booking';
import { commitment, needsForfeit, replaceable } from '../../libs/booking';
import { usePublicProfiles } from '../../libs/hooks/usePublicProfiles';

export function useCareAction({
  action,
  onUncertain,
  onComplete,
}: {
  action: Action;
  onUncertain: () => void;
  onComplete: (receipt: Receipt) => void;
}) {
  const [current, setCurrent] = useState(action),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [problem, setProblem] = useState<BookingProblem>(),
    [consent, setConsent] = useState(false),
    [forfeit, setForfeit] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [receipt, setReceipt] = useState<Receipt>(),
    [verifiedOriginal, setVerifiedOriginal] = useState(action.original),
    [stale, setStale] = useState(false);
  const request = useRef<AbortController | null>(null),
    baseline = useRef<Set<string>>(new Set());
  const profiles = usePublicProfiles([
    current.target.doctorId,
    current.target.clinicId,
    ...(current.original
      ? [current.original.doctorId, current.original.clinicId]
      : []),
    ...(problem?.existingCommitments.flatMap((row) => [
      row.doctorId,
      row.clinicId,
    ]) || []),
  ]);
  useEffect(() => () => request.current?.abort(), []);
  const joining =
    current.kind === 'WAITLIST' &&
    ['CREATE', 'REPLACE'].includes(current.operation);
  const forfeiting = needsForfeit(current);
  const title = receipt
    ? 'Your care, updated'
    : uncertain
      ? 'Check this request'
      : current.operation === 'CANCEL'
        ? 'Cancel this appointment?'
        : current.operation === 'WITHDRAW'
          ? 'Leave this waitlist?'
          : current.operation === 'REPLACE'
            ? 'Review your replacement'
            : joining
              ? 'Review waitlist enrollment'
              : 'Review your appointment';
  function complete(record: RecordItem) {
    const result = { kind: current.kind, record, operation: current.operation };
    setReceipt(result);
    setUncertain(false);
    setError('');
    onComplete(result);
  }
  async function reconcile(signal: AbortSignal) {
    if (current.operation === 'CANCEL' || current.operation === 'WITHDRAW') {
      const row = await detail(current.kind, current.original!.id, signal);
      if (
        !signal.aborted &&
        [
          'CANCELED',
          'WITHDRAWN',
          'FULFILLED',
          'EXPIRED',
          'INELIGIBLE',
          'COMPLETED',
          'NO_SHOW',
        ].includes(row.status)
      ) {
        complete(row);
        return;
      }
    } else {
      const rows = await targetRecords(current.kind, current.target, signal);
      const added = rows.filter((row) => !baseline.current.has(row._id));
      if (!signal.aborted && added.length === 1) {
        complete(added[0]);
        return;
      }
    }
    if (!signal.aborted)
      setError(
        'A completed request is not visible yet. Do not submit again. Check again or review My Care before starting a new request.',
      );
  }
  async function submit() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setProblem(undefined);
    try {
      if (uncertain) {
        await reconcile(controller.signal);
        return;
      }
      if (current.original) {
        const row = await detail(
          current.original.kind,
          current.original.id,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setVerifiedOriginal(commitment(current.original.kind, row));
        if (
          row.version !== current.original.version ||
          (['REPLACE'].includes(current.operation) &&
            !replaceable(commitment(current.original.kind, row)))
        ) {
          setStale(true);
          throw new BookingError(
            'Your original commitment changed. Close this review and refresh My Care before continuing.',
            'STALE_COMMITMENT',
          );
        }
      }
      if (current.operation === 'CREATE' || current.operation === 'REPLACE')
        baseline.current = new Set(
          (
            await targetRecords(current.kind, current.target, controller.signal)
          ).map((row) => row._id),
        );
      const result = await execute(current, controller.signal);
      if (!controller.signal.aborted) {
        setReceipt(result);
        setUncertain(false);
        onComplete(result);
      }
    } catch (reason) {
      if (controller.signal.aborted) return;
      const issue =
        reason instanceof BookingError
          ? reason
          : new BookingError('The request could not be confirmed.');
      setError(issue.message);
      setProblem(issue.problem);
      if (current.original && !issue.uncertain) {
        try {
          const row = await detail(
            current.original.kind,
            current.original.id,
            controller.signal,
          );
          if (!controller.signal.aborted)
            setVerifiedOriginal(commitment(current.original.kind, row));
        } catch {
          /* keep the last verified state */
        }
      }
      if (issue.uncertain) {
        setUncertain(true);
        onUncertain();
        try {
          await reconcile(controller.signal);
        } catch {
          if (!controller.signal.aborted)
            setError(
              'We still cannot confirm the result. Check again or open My Care. Do not submit this request again.',
            );
        }
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }
  function chooseReplacement() {
    if (!problem || problem.existingCommitments.length !== 1) return;
    setCurrent({
      ...current,
      operation: 'REPLACE',
      original: problem.existingCommitments[0],
    });
    setVerifiedOriginal(problem.existingCommitments[0]);
    setStale(false);
    setProblem(undefined);
    setError('');
    setConsent(false);
    setForfeit(false);
  }
  return {
    current,
    busy,
    error,
    problem,
    consent,
    forfeit,
    uncertain,
    receipt,
    verifiedOriginal,
    stale,
    profiles,
    joining,
    forfeiting,
    title,
    setConsent,
    setForfeit,
    submit,
    chooseReplacement,
  };
}
export type CareActionState = ReturnType<typeof useCareAction>;
