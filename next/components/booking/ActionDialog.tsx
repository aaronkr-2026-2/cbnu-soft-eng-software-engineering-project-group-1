import Link from 'next/link';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import type { Action, Receipt } from '../../types/booking';
import { label } from '../../libs/booking';
import { CommitmentView } from './CommitmentView';
import { useCareAction } from './useCareAction';

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
  const {
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
  } = useCareAction({ action, onUncertain, onComplete });
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
