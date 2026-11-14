import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import {
  AccountDeletionReview,
  blockerKey,
  resolutionMessage,
} from '../../libs/account-deletion';
import { label, timeLabel } from '../../libs/booking';
import type { DeletionList } from '../../types/account-deletion';

export function AccountDeletionDialog({ onClose }: { onClose: () => void }) {
  const [review] = useState(() => new AccountDeletionReview());
  const state = useSyncExternalStore(
    review.subscribe,
    review.snapshot,
    review.snapshot,
  );
  const [confirm, setConfirm] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void review.refresh();
    return review.dispose;
  }, [review]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') {
        setConfirm(null);
        void review.refresh();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [review]);
  const busy =
    state.status === 'loading' || !!state.pending || !!state.loadingMore;
  const actionable = state.status === 'ready' && !busy;
  const data = state.data;
  function refresh() {
    setConfirm(null);
    void review.refresh();
  }
  function list(name: DeletionList, title: string, count: number) {
    if (!data) return null;
    const page = data[name];
    return (
      <section
        className="account-deletion__section"
        aria-labelledby={`deletion-${name}`}
      >
        <h3 id={`deletion-${name}`}>
          {title} ({count})
        </h3>
        {count === 0 ? (
          <p>No blocking {title.toLowerCase()}.</p>
        ) : (
          <>
            <p className="account-deletion__count">
              Showing {page.entries.length} of {count}
            </p>
            <ul className="account-deletion__list">
              {page.entries.map((row) => {
                const key = blockerKey(row);
                const action =
                  row.permittedAction === 'CANCEL_BOOKING'
                    ? 'Cancel booking'
                    : 'Cancel waitlist';
                const summary = `${row.clinicName}, ${row.doctorName}, ${timeLabel(row.startsAt, row.clinicTimezone)}`;
                return (
                  <li key={key} className="account-deletion__entry">
                    <div>
                      <h4>{row.clinicName}</h4>
                      <p>{row.doctorName}</p>
                      <p>
                        {timeLabel(row.startsAt, row.clinicTimezone)} –{' '}
                        {timeLabel(row.endsAt, row.clinicTimezone, false)} (
                        {row.clinicTimezone})
                      </p>
                      <p className="account-deletion__status">
                        {label(row.status)}
                      </p>
                    </div>
                    {row.permittedAction === 'NONE' ? (
                      <p>{resolutionMessage(row.resolutionReason)}</p>
                    ) : confirm === key ? (
                      <div
                        className="account-deletion__confirmation"
                        role="group"
                        aria-label={`Confirm cancellation for ${summary}`}
                      >
                        <p>
                          {row.kind === 'APPOINTMENT'
                            ? 'Cancel this booking and release its time?'
                            : 'Cancel this waitlist entry and give up its position?'}
                        </p>
                        <div className="account-deletion__buttons">
                          <Button
                            disabled={!actionable}
                            onClick={() => setConfirm(null)}
                          >
                            Keep it
                          </Button>
                          <Button
                            color="error"
                            variant="contained"
                            disabled={!actionable}
                            onClick={() => {
                              setConfirm(null);
                              // The initiating button may disappear after a successful cancellation.
                              content.current?.focus();
                              void review.act(row);
                            }}
                          >
                            Confirm cancellation
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        color="error"
                        variant="outlined"
                        disabled={!actionable}
                        aria-label={`${action} for ${summary}`}
                        onClick={() => setConfirm(key)}
                      >
                        {state.pending === key ? 'Canceling…' : action}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {page.nextCursor && (
              <Button
                disabled={!actionable}
                onClick={() => {
                  setConfirm(null);
                  void review.more(name);
                }}
              >
                {state.loadingMore === name
                  ? 'Loading…'
                  : `Load more ${title.toLowerCase()}`}
              </Button>
            )}
          </>
        )}
      </section>
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      className="account-deletion"
      aria-labelledby="account-deletion-heading"
      aria-describedby="account-deletion-description"
      slotProps={{ transition: { onEntered: () => heading.current?.focus() } }}
    >
      <DialogTitle id="account-deletion-heading" ref={heading} tabIndex={-1}>
        Delete account
        <IconButton
          aria-label="Close account deletion dialog"
          onClick={onClose}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent ref={content} tabIndex={-1} aria-busy={busy}>
        <DialogContentText id="account-deletion-description">
          Resolve your appointments and waitlist entries before closing your
          account. Completed cancellations remain in effect when you close this
          dialog.
        </DialogContentText>
        <div
          className="account-deletion__feedback"
          aria-live="polite"
          aria-atomic="true"
        >
          {state.status === 'loading' && (
            <p className="account-deletion__loading">
              <CircularProgress size={20} aria-hidden="true" />
              Checking current commitments…
            </p>
          )}
          {state.pending && (
            <p role="status">Canceling and checking current commitments…</p>
          )}
          {state.loadingMore && <p>Loading more commitments…</p>}
          {state.message && <Alert severity="info">{state.message}</Alert>}
        </div>
        {state.error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" disabled={busy} onClick={refresh}>
                Refresh
              </Button>
            }
          >
            {state.error}
          </Alert>
        )}
        {data && (
          <>
            {list('appointments', 'Appointments', data.appointmentCount)}
            {list('waitlists', 'Waitlist entries', data.waitlistCount)}
            {data.affiliationImpactCount > 0 && (
              <Alert severity="info">
                Closing this clinic account will detach{' '}
                {data.affiliationImpactCount} pending or approved doctor
                affiliation{data.affiliationImpactCount === 1 ? '' : 's'}.
              </Alert>
            )}
            {state.status === 'ready' && data.ready && (
              <Alert severity="success">
                Your commitments are resolved. Account deletion is not available
                yet.
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={refresh}>
          Refresh commitments
        </Button>
        <Button onClick={onClose}>Close</Button>
        <Button color="error" variant="contained" disabled>
          Delete account
        </Button>
      </DialogActions>
    </Dialog>
  );
}
