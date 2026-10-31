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
  CommitmentKind,
  RecordItem,
  Receipt,
} from '../../types/booking';
import { detail, myAppointments, myWaitlist } from '../../libs/api/booking';
import { commitment, label, replaceable } from '../../libs/booking';
import { usePublicProfiles } from '../../libs/hooks/usePublicProfiles';
import { CareLayout } from './CareLayout';
import { PatientGate } from './PatientGate';
import { CommitmentView } from './CommitmentView';
import { ActionDialog } from './ActionDialog';
export function MyCarePage({ kind }: { kind: CommitmentKind }) {
  return (
    <CareLayout
      title={kind === 'APPOINTMENT' ? 'Your appointments.' : 'Your waitlist.'}
      intro={
        kind === 'APPOINTMENT'
          ? 'Your confirmed visits and appointment history, together.'
          : 'Keep track of the exact slots you are waiting for.'
      }
    >
      <PatientGate>
        <CareRecords key={kind} kind={kind} />
      </PatientGate>
    </CareLayout>
  );
}
function CareRecords({ kind }: { kind: CommitmentKind }) {
  const [rows, setRows] = useState<RecordItem[]>([]),
    [after, setAfter] = useState<string | null>(null),
    [filter, setFilter] = useState(kind === 'APPOINTMENT' ? 'UPCOMING' : ''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [more, setMore] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action>(),
    [open, setOpen] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [viewed, setViewed] = useState<RecordItem>(),
    [detailBusy, setDetailBusy] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  useEffect(() => () => detailRequest.current?.abort(), []);
  const profiles = usePublicProfiles([
    ...rows.flatMap((row) => [row.doctorId, row.clinicId]),
    ...(viewed ? [viewed.doctorId, viewed.clinicId] : []),
  ]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const input = {
      limit: 20,
      ...(cursor ? { after: cursor } : {}),
      ...(filter === 'UPCOMING'
        ? { status: 'CONFIRMED', from: new Date().toISOString() }
        : filter
          ? { status: filter }
          : {}),
    };
    const fetch =
      kind === 'APPOINTMENT'
        ? myAppointments(input, controller.signal)
        : myWaitlist(input, controller.signal);
    void fetch
      .then((page) => {
        if (controller.signal.aborted) return;
        setRows((previous) =>
          cursor
            ? [
                ...previous,
                ...page.entries.filter(
                  (row) => !previous.some((old) => old._id === row._id),
                ),
              ]
            : page.entries,
        );
        setAfter(page.nextCursor);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load your care.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setMore(false);
        }
      });
    return () => controller.abort();
  }, [kind, filter, cursor, refresh]);
  function reload() {
    setCursor(undefined);
    setRefresh((value) => value + 1);
  }
  async function view(row: RecordItem) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetailBusy(true);
    setError('');
    try {
      const result = await detail(kind, row._id, controller.signal);
      if (!controller.signal.aborted) setViewed(result);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Could not read this commitment.',
        );
    } finally {
      if (!controller.signal.aborted) setDetailBusy(false);
    }
  }
  function change(row: RecordItem) {
    setAction({
      operation: kind === 'APPOINTMENT' ? 'CANCEL' : 'WITHDRAW',
      kind,
      target: row,
      original: commitment(kind, row),
    });
    setOpen(true);
  }
  function completed(result: Receipt) {
    setUncertain(false);
    setNotice(`Current status: ${label(result.record.status)}.`);
    reload();
  }
  const options =
    kind === 'APPOINTMENT'
      ? ['UPCOMING', 'CONFIRMED', 'CANCELED', 'COMPLETED', 'NO_SHOW']
      : [
          'ACTIVE',
          'NOTIFICATION_ONLY',
          'FULFILLED',
          'WITHDRAWN',
          'EXPIRED',
          'INELIGIBLE',
        ];
  return (
    <>
      <div className="care-toolbar">
        <label>
          Show
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setCursor(undefined);
              setRows([]);
              setMore(false);
            }}
          >
            <option value="">All history</option>
            {options.map((value) => (
              <option key={value} value={value}>
                {value === 'UPCOMING' ? 'Upcoming appointments' : label(value)}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={loading} onClick={reload}>
          Refresh My Care
        </Button>
        <Button component={Link} href="/book" variant="contained">
          Book a visit
        </Button>
      </div>
      {kind === 'WAITLIST' && (
        <Alert severity="info">
          A waitlist entry does not reserve an appointment. At least 48 hours
          ahead, eligible slots may be booked automatically when enabled. Inside
          48 hours, you must book an opening manually.
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert
          severity="warning"
          action={<Button onClick={reload}>Try again</Button>}
        >
          {error}
        </Alert>
      )}
      {uncertain && (
        <Alert severity="warning">
          Check your previous request before making another change.{' '}
          <Button onClick={() => setOpen(true)}>Check previous request</Button>
        </Alert>
      )}
      {loading && !more && <p role="status">Loading your care…</p>}
      {!loading && !error && !rows.length && (
        <div className="care-empty">
          <h2>
            No {kind === 'APPOINTMENT' ? 'appointments' : 'waitlist entries'} in
            this view.
          </h2>
          <p>Choose another view or explore the available care teams.</p>
        </div>
      )}
      <div className="care-records">
        {rows.map((row) => {
          const source = commitment(kind, row),
            canReplace = replaceable(source),
            canChange =
              kind === 'APPOINTMENT'
                ? row.status === 'CONFIRMED' &&
                  +new Date(row.startsAt) > Date.now()
                : ['ACTIVE', 'NOTIFICATION_ONLY'].includes(row.status);
          return (
            <article className="care-card" key={row._id}>
              <CommitmentView value={source} profiles={profiles} />
              {kind === 'WAITLIST' && 'queuePosition' in row && (
                <p className="care-meta">
                  {row.queuePosition
                    ? `Current queue position: ${row.queuePosition}. `
                    : ''}
                  {row.automaticBookingEnabled
                    ? 'Automatic booking enabled.'
                    : 'Automatic booking paused.'}
                </p>
              )}
              <div className="care-actions">
                <Button disabled={detailBusy} onClick={() => void view(row)}>
                  View details
                </Button>
                {canReplace && (
                  <Button
                    component={Link}
                    href={`/book?${new URLSearchParams({ replaceKind: kind, replaceId: row._id, clinicId: row.clinicId, doctorId: row.doctorId })}`}
                    disabled={uncertain}
                  >
                    Choose replacement
                  </Button>
                )}
                {canChange && (
                  <Button
                    color="error"
                    disabled={uncertain}
                    onClick={() => change(row)}
                  >
                    {kind === 'APPOINTMENT'
                      ? 'Cancel appointment'
                      : 'Leave waitlist'}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {after && (
        <Button
          variant="outlined"
          disabled={loading}
          onClick={() => {
            setMore(true);
            setCursor(after);
          }}
        >
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      )}
      {action && (
        <ActionDialog
          action={action}
          open={open}
          onUncertain={() => setUncertain(true)}
          onComplete={completed}
          onClose={(pending) => {
            setOpen(false);
            if (!pending) {
              setAction(undefined);
              reload();
            }
          }}
        />
      )}
      <Dialog
        open={!!viewed}
        onClose={() => setViewed(undefined)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="care-detail-title"
      >
        <DialogTitle id="care-detail-title">
          {kind === 'APPOINTMENT' ? 'Appointment' : 'Waitlist'} details
        </DialogTitle>
        <DialogContent>
          {viewed && (
            <>
              <CommitmentView
                value={commitment(kind, viewed)}
                profiles={profiles}
              />
              <p className="care-reference">Reference: {viewed._id}</p>
              {'automaticBookingConsent' in viewed && (
                <>
                  <p>
                    Automatic booking consent:{' '}
                    {viewed.automaticBookingConsent
                      ? 'recorded'
                      : 'not recorded'}
                    .
                  </p>
                  <p>
                    Automatic booking{' '}
                    {viewed.automaticBookingEnabled
                      ? 'enabled'
                      : 'currently paused'}
                    .
                  </p>
                  <p className="care-meta">
                    Consent policy: {viewed.consentPolicyVersion}. Recorded{' '}
                    {new Date(viewed.consentedAt).toLocaleString()}.
                  </p>
                </>
              )}
              {'source' in viewed && (
                <p>Booked through: {label(viewed.source)}</p>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewed(undefined)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
