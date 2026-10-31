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
import { useNoticeContext } from '../../libs/hooks/useNotifications';
import { usePublicProfiles } from '../../libs/hooks/usePublicProfiles';
import {
  getNotification,
  markNotificationRead,
} from '../../libs/api/notification';
import { BookingError } from '../../libs/api/booking';
import {
  notificationStatus,
  notificationTitle,
  ownedCareLink,
  slotBookingLink,
} from '../../libs/notification';
import { commitment, label, timeLabel } from '../../libs/booking';
import { CommitmentView } from '../booking/CommitmentView';
export function NotificationDetail({
  id,
  onClose,
  onRead,
}: {
  id: string;
  onClose: () => void;
  onRead: () => void;
}) {
  const [refresh, setRefresh] = useState(0),
    [readAt, setReadAt] = useState(''),
    [uncertain, setUncertain] = useState(false),
    [readError, setReadError] = useState(''),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const state = useNoticeContext(id, refresh),
    context = state.data;
  const profiles = usePublicProfiles(
    context
      ? [context.notification.doctorId, context.notification.clinicId]
      : [],
  );
  const notice = context?.notification,
    isRead = !!(readAt || notice?.readAt),
    fresh = state.status === 'live';
  const zone =
    context?.slot?.clinicTimezone ||
    profiles[notice?.clinicId || '']?.clinicTimezone ||
    'UTC';
  useEffect(() => () => request.current?.abort(), []);
  // A background owned read may resolve an ambiguous mark-read response. It
  // never submits a second mutation or treats opening details as a read action.
  useEffect(() => {
    if (uncertain && notice?.readAt) {
      setUncertain(false);
      setReadError('');
      onRead();
    }
  }, [uncertain, notice?.readAt, onRead]);
  async function mark() {
    if (request.current || isRead) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setReadError('');
    try {
      const result = uncertain
        ? await getNotification(id, controller.signal)
        : await markNotificationRead(id, controller.signal);
      if (controller.signal.aborted) return;
      if (result.readAt) {
        setReadAt(result.readAt);
        setUncertain(false);
        onRead();
        setRefresh((value) => value + 1);
      } else
        setReadError(
          'Read status is not confirmed yet. Check again before trying another change.',
        );
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof BookingError && reason.uncertain)
        setUncertain(true);
      setReadError(
        'Could not confirm read status. Check current state; this screen will not automatically repeat the write.',
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }
  const appointmentLink = notice
      ? ownedCareLink(
          {
            ...notice,
            appointmentId:
              context?.appointment?._id ||
              context?.waitlist?.appointmentId ||
              notice.appointmentId,
          },
          'APPOINTMENT',
        )
      : null,
    waitlistLink = notice ? ownedCareLink(notice, 'WAITLIST') : null;
  return (
    <Dialog
      open
      fullWidth
      maxWidth="md"
      aria-labelledby="notice-detail-title"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <DialogTitle id="notice-detail-title">
        {notice ? notificationTitle(notice.type) : 'Notification details'}
      </DialogTitle>
      <DialogContent>
        {state.status === 'loading' && (
          <p role="status">
            Checking this notification and its current target…
          </p>
        )}
        {state.error && (
          <Alert severity="warning">
            {state.error} Current target details are not verified.
          </Alert>
        )}
        {notice && (
          <>
            <p className="notice-read-label">{isRead ? 'Read' : 'Unread'}</p>
            <section className="notice-history">
              <h3>Notice as recorded</h3>
              <p>{notice.message}</p>
              <p className="care-meta">
                Recorded {timeLabel(notice.occurredAt, zone)} · {zone}
              </p>
            </section>
            {fresh && context && (
              <section
                className="notice-current"
                aria-labelledby="notice-current-title"
              >
                <h3 id="notice-current-title">Latest target check</h3>
                <Alert
                  severity={
                    context.targetKind === 'APPOINTMENT' &&
                    context.appointment?.status === 'CONFIRMED'
                      ? 'success'
                      : 'info'
                  }
                >
                  {notificationStatus(context)}
                </Alert>
                <p className="care-meta">
                  Checked {timeLabel(context.checkedAt, zone)} · {zone}. State
                  may change after this check.
                </p>
                {context.targetKind === 'APPOINTMENT' &&
                  context.appointment && (
                    <>
                      <CommitmentView
                        value={commitment('APPOINTMENT', context.appointment)}
                        profiles={profiles}
                        zone={zone}
                      />
                      <p>
                        Booking source: {label(context.appointment.source)}.
                      </p>
                      {context.appointment.status === 'CONFIRMED' ? (
                        <p>
                          This appointment is reserved. Its current status is
                          shown above.
                        </p>
                      ) : (
                        <p>
                          The historical booking notice is not proof of a
                          current confirmed appointment.
                        </p>
                      )}
                      {appointmentLink && (
                        <Button component={Link} href={appointmentLink}>
                          Open current appointment
                        </Button>
                      )}
                    </>
                  )}
                {context.targetKind === 'SLOT' && context.slot && (
                  <>
                    <CommitmentView
                      value={context.slot}
                      profiles={profiles}
                      zone={zone}
                    />
                    <p>
                      This alert does not reserve a slot. The booking page
                      checks availability again, and confirmation checks it once
                      more.
                    </p>
                    <Button
                      component={Link}
                      href={slotBookingLink(context.slot)}
                    >
                      {context.slot.state === 'AVAILABLE'
                        ? 'Check this slot before booking'
                        : 'View current times'}
                    </Button>
                  </>
                )}
                {context.targetKind === 'WAITLIST' && context.waitlist && (
                  <CommitmentView
                    value={commitment('WAITLIST', context.waitlist)}
                    profiles={profiles}
                    zone={zone}
                  />
                )}
                {context.targetKind === 'UNAVAILABLE' && (
                  <p>
                    This slot or commitment may have closed, started, or become
                    unavailable. Explore current care times instead of relying
                    on this old alert.
                  </p>
                )}
                {context.targetKind !== 'APPOINTMENT' &&
                  context.waitlist?.appointmentId &&
                  appointmentLink && (
                    <Button component={Link} href={appointmentLink}>
                      Open linked appointment
                    </Button>
                  )}
                {context.waitlist && waitlistLink && (
                  <Button component={Link} href={waitlistLink}>
                    Open current waitlist
                  </Button>
                )}
              </section>
            )}
            {!fresh && context && (
              <p>
                Recheck the target to see its latest status. The old alert does
                not establish current availability.
              </p>
            )}
          </>
        )}
        {readError && <Alert severity="warning">{readError}</Alert>}
      </DialogContent>
      <DialogActions className="notice-dialog-actions">
        <Button disabled={busy} onClick={onClose}>
          Close
        </Button>
        <Button
          disabled={busy || state.status === 'loading'}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Recheck target
        </Button>
        {notice && !isRead && (
          <Button
            variant="contained"
            disabled={busy || (!fresh && !uncertain)}
            onClick={() => void mark()}
          >
            {busy
              ? 'Checking…'
              : uncertain
                ? 'Check read status'
                : 'Mark as read'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
