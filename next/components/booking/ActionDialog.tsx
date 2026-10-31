import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
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
import {
  commitment,
  label,
  needsForfeit,
  replaceable,
} from '../../libs/booking';
import { usePublicProfiles } from '../../libs/hooks/usePublicProfiles';
import { CommitmentView } from './CommitmentView';
export function ActionDialog({
  action,
  open,
  zone,
  onClose,
  onUncertain,
  onComplete,
}: {
  action: Action;
  open: boolean;
  zone?: string;
  onClose: (uncertain: boolean) => void;
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
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose(uncertain);
      }}
      fullWidth
      maxWidth="md"
      aria-labelledby="care-action-title"
    >
      <DialogTitle id="care-action-title">{title}</DialogTitle>
      <DialogContent>
        {receipt ? (
          <>
            <Alert
              severity={
                receipt.record.status === 'CONFIRMED' ||
                receipt.record.status === 'ACTIVE'
                  ? 'success'
                  : 'info'
              }
            >
              {receipt.record.status === 'CONFIRMED'
                ? 'Your appointment is confirmed.'
                : receipt.kind === 'WAITLIST' &&
                    receipt.record.status === 'ACTIVE'
                  ? 'You are on the waitlist. No appointment is reserved.'
                  : `Current status: ${label(receipt.record.status)}.`}
            </Alert>
            <p className="care-reference">Reference: {receipt.record._id}</p>
            <CommitmentView
              value={{
                ...receipt.record,
                kind: receipt.kind,
                id: receipt.record._id,
              }}
              profiles={profiles}
              zone={zone}
            />
            {receipt.kind === 'WAITLIST' &&
              'automaticBookingEnabled' in receipt.record && (
                <p>
                  {receipt.record.automaticBookingEnabled
                    ? 'Automatic booking is enabled for eligible openings at least 48 hours ahead.'
                    : 'Automatic booking is currently paused. Your consent is recorded; joining does not reserve an appointment.'}
                </p>
              )}
          </>
        ) : (
          <>
            {verifiedOriginal && (
              <CommitmentView
                title="Current commitment"
                value={verifiedOriginal}
                profiles={profiles}
              />
            )}
            {['CREATE', 'REPLACE'].includes(current.operation) && (
              <CommitmentView
                title={
                  current.operation === 'REPLACE'
                    ? 'Requested commitment'
                    : joining
                      ? 'Requested waitlist'
                      : 'Requested appointment'
                }
                value={current.target}
                profiles={profiles}
                zone={zone}
              />
            )}
            {current.operation === 'REPLACE' && (
              <p>
                The server will replace these together. If the requested booking
                or enrollment fails, it keeps the original commitment.
              </p>
            )}
            {current.operation === 'CANCEL' && (
              <p>
                This releases your confirmed appointment. It may be booked by
                someone else.
              </p>
            )}
            {current.operation === 'WITHDRAW' && (
              <p>
                You will lose this queue position. Joining again puts you at the
                back of the queue.
              </p>
            )}
            {joining && (
              <>
                <p>
                  Waitlists target this exact doctor and time. Enrollment closes
                  inside 48 hours. Later openings require manual booking.
                </p>
                <label className="care-check">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={busy || uncertain}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  I consent to automatic booking for this exact slot when
                  enabled and at least 48 hours ahead. Inside 48 hours, I must
                  book an opening myself.
                </label>
              </>
            )}
            {forfeiting && (
              <Alert severity="warning">
                <p>
                  You are giving up a confirmed appointment for a waitlist
                  entry. A waitlist does not guarantee a booking.
                </p>
                <label className="care-check">
                  <input
                    type="checkbox"
                    checked={forfeit}
                    disabled={busy || uncertain}
                    onChange={(event) => setForfeit(event.target.checked)}
                  />
                  I understand I will give up my confirmed appointment.
                </label>
              </Alert>
            )}
            {error && (
              <Alert severity={uncertain ? 'warning' : 'error'} role="alert">
                {error}
              </Alert>
            )}
            {problem?.existingCommitments.map((row) => (
              <CommitmentView
                key={`${row.kind}:${row.id}`}
                title={`Blocking ${row.kind === 'WAITLIST' ? 'waitlist' : 'appointment'}`}
                value={row}
                profiles={profiles}
              />
            ))}
            {problem && (
              <div className="care-actions">
                <Button onClick={() => onClose(false)}>
                  {problem.existingCommitments.length
                    ? 'Keep existing commitment'
                    : 'Close and choose another time'}
                </Button>
                {current.operation === 'CREATE' &&
                  problem.choices.includes('REPLACE') && (
                    <Button variant="outlined" onClick={chooseReplacement}>
                      Review replacement
                    </Button>
                  )}
              </div>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={() => onClose(uncertain)}>
          {receipt
            ? 'Close'
            : uncertain
              ? 'Close and keep checking later'
              : 'Close review'}
        </Button>
        {receipt || uncertain ? (
          <Button
            component={Link}
            href={current.kind === 'WAITLIST' ? '/waitlist' : '/appointments'}
          >
            Open My Care
          </Button>
        ) : null}
        {!receipt && !problem && (
          <Button
            variant="contained"
            disabled={
              busy ||
              stale ||
              (!uncertain &&
                ((joining && !consent) || (forfeiting && !forfeit)))
            }
            onClick={() => void submit()}
          >
            {busy
              ? 'Checking…'
              : uncertain
                ? 'Check current state'
                : current.operation === 'CANCEL'
                  ? 'Confirm cancellation'
                  : current.operation === 'WITHDRAW'
                    ? 'Confirm withdrawal'
                    : current.operation === 'REPLACE'
                      ? 'Confirm replacement'
                      : joining
                        ? 'Join waitlist'
                        : 'Confirm booking'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
