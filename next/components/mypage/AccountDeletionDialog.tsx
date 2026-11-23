import { deleteAccount } from '../../libs/api/account-deletion';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
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
  DELETION_READINESS_MAX_AGE_MS,
  blockerKey,
  resolutionMessage,
} from '../../libs/account-deletion';
import { label, timeLabel } from '../../libs/booking';
import type { DeletionList } from '../../types/account-deletion';

export function AccountDeletionDialog({
  memberId,
  onClose,
  onDeleted,
  onUncertain,
}: {
  memberId: string;
  onClose: () => void;
  onDeleted: () => Promise<boolean>;
  onUncertain: () => void;
}) {
  const [review] = useState(
    () =>
      new AccountDeletionReview(undefined, undefined, (signal) =>
        deleteAccount(signal, memberId),
      ),
  );
  const [signingOut, setSigningOut] = useState(false);
  const [cleanupError, setCleanupError] = useState(false);
  const state = useSyncExternalStore(
    review.subscribe,
    review.snapshot,
    review.snapshot,
  );
  const [confirm, setConfirm] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const retrySignOut = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (cleanupError) retrySignOut.current?.focus();
  }, [cleanupError]);
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
  useEffect(() => {
    if (
      state.status !== 'ready' ||
      !state.data?.ready ||
      state.outcome !== 'idle'
    )
      return;
    const timer = setTimeout(
      () => review.expire(),
      Math.max(0, state.checkedAt + DELETION_READINESS_MAX_AGE_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [review, state.status, state.data?.ready, state.checkedAt, state.outcome]);
  const locked = state.outcome === 'submitting' || state.outcome === 'deleted';
  async function finish() {
    setSigningOut(true);
    setCleanupError(false);
    try {
      if (!(await onDeleted())) setCleanupError(true);
    } catch {
      setCleanupError(true);
    } finally {
      setSigningOut(false);
    }
  }
  async function submit() {
    if (await review.submit()) await finish();
    else if (review.snapshot().outcome === 'uncertain') onUncertain();
  }
  const busy =
    state.outcome === 'submitting' ||
    signingOut ||
    state.status === 'loading' ||
    !!state.pending ||
    !!state.loadingMore;
  const actionable =
    state.status === 'ready' && state.outcome === 'idle' && !busy;
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
      onClose={() => {
        if (!locked) onClose();
      }}
      fullWidth
      maxWidth="sm"
      className="account-deletion"
      aria-labelledby="account-deletion-heading"
      aria-describedby={
        state.outcome === 'deleted' ? undefined : 'account-deletion-description'
      }
      slotProps={{ transition: { onEntered: () => heading.current?.focus() } }}
    >
      <DialogTitle ref={heading} tabIndex={-1}>
        <span id="account-deletion-heading">Delete account</span>
        <IconButton
          aria-label="Close account deletion dialog"
          onClick={onClose}
          disabled={locked}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent ref={content} tabIndex={-1} aria-busy={busy}>
        {state.outcome === 'deleted' ? (
          <>
            <Alert severity="success">Your account has been deleted.</Alert>
            {cleanupError ? (
              <Alert severity="warning">
                Local sign-out could not be completed. Retry sign-out to clear
                this browser's session cookie.
              </Alert>
            ) : (
              <p role="status">Finishing sign-out…</p>
            )}
          </>
        ) : (
          <>
            <DialogContentText id="account-deletion-description">
              Resolve your appointments and waitlist entries before closing your
              account. Completed cancellations remain in effect when you close
              this dialog.
            </DialogContentText>
            <div
              className="account-deletion__feedback"
              aria-live="polite"
              aria-atomic="true"
            >
              {state.outcome === 'submitting' && (
                <p role="status">Deleting your account…</p>
              )}
              {state.outcome === 'uncertain' && (
                <Alert severity="warning">
                  Account deletion could not be confirmed. A rejected sign-in or
                  session does not confirm deletion. Check current account
                  status before making another request.
                </Alert>
              )}
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
              {state.message && state.outcome !== 'uncertain' && (
                <Alert severity="info">{state.message}</Alert>
              )}
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
                    Your appointments and waitlists are resolved.
                  </Alert>
                )}
              </>
            )}
            {state.outcome === 'idle' && (
              <div className="account-deletion__agreement">
                <p>
                  Deleting your account permanently closes your access. You
                  cannot restore this account. Are you sure you want to delete
                  your account?
                </p>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={state.agreement}
                      disabled={!actionable || !data?.ready}
                      onChange={(event) => review.agree(event.target.checked)}
                    />
                  }
                  label="I understand and agree to delete my account."
                />
              </div>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {state.outcome === 'deleted' ? (
          <Button
            ref={retrySignOut}
            disabled={signingOut}
            onClick={() => void finish()}
          >
            Retry sign-out
          </Button>
        ) : (
          <>
            <Button disabled={busy} onClick={refresh}>
              {state.outcome === 'uncertain'
                ? 'Check account status'
                : 'Refresh commitments'}
            </Button>
            <Button disabled={locked} onClick={onClose}>
              Close
            </Button>
            <Button
              color="error"
              variant="contained"
              disabled={!review.canDelete()}
              onClick={() => void submit()}
            >
              {state.outcome === 'submitting' ? 'Deleting…' : 'Delete account'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
