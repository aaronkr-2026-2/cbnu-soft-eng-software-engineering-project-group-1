import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Alert, Button } from '@mui/material';
import { CareLayout } from '../booking/CareLayout';
import { PatientGate } from '../booking/PatientGate';
import { NotificationDetail } from './NotificationDetail';
import { useNotifications } from '../../libs/hooks/useNotifications';
import {
  notificationIdPattern,
  notificationTitle,
} from '../../libs/notification';
import { timeLabel } from '../../libs/booking';
export function NotificationsPage() {
  return (
    <CareLayout
      title="Your care updates."
      intro="Waitlist updates and booking notices, with a fresh check before your next step."
    >
      <PatientGate>
        <NotificationInbox />
      </PatientGate>
    </CareLayout>
  );
}
function NotificationInbox() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false),
    [pages, setPages] = useState(1),
    [refresh, setRefresh] = useState(0);
  const state = useNotifications(unreadOnly, pages, refresh);
  const onRead = useCallback(() => setRefresh((value) => value + 1), []);
  const requested =
    typeof router.query.notificationId === 'string'
      ? router.query.notificationId
      : '';
  const selected = notificationIdPattern.test(requested) ? requested : '';
  function close() {
    void router.replace('/notifications', undefined, {
      shallow: true,
      scroll: false,
    });
  }
  return (
    <>
      <div className="care-toolbar">
        <label>
          Show notifications
          <select
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(event) => {
              setUnreadOnly(event.target.value === 'unread');
              setPages(1);
            }}
          >
            <option value="all">All notifications</option>
            <option value="unread">Unread only</option>
          </select>
        </label>
        <Button onClick={() => setRefresh((value) => value + 1)}>
          Refresh notifications
        </Button>
        <p role="status">
          {state.data
            ? `${state.data.unreadCount} unread notifications`
            : 'Loading notifications…'}
        </p>
      </div>
      <p className="care-meta">
        In-app notices refresh about every 15 seconds while this tab is visible.
        Opening a notice does not mark it as read. An opening alert never
        reserves an appointment.
      </p>
      {state.error && <Alert severity="warning">{state.error}</Alert>}
      {state.status === 'loading' && (
        <p role="status">Refreshing your inbox…</p>
      )}
      {requested && !selected && (
        <Alert
          severity="warning"
          action={<Button onClick={close}>Close link</Button>}
        >
          This notification link is invalid.
        </Alert>
      )}
      {state.data && !state.data.entries.length && (
        <div className="care-empty">
          <h2>
            {unreadOnly
              ? 'You have no unread notifications.'
              : 'No care updates yet.'}
          </h2>
          <p>
            Waitlist and booking updates will appear here after they are
            delivered.
          </p>
        </div>
      )}
      <div className="notice-list">
        {state.data?.entries.map((row) => (
          <article
            className={`care-card notice-card ${row.readAt ? '' : 'notice-card--unread'}`}
            key={row._id}
          >
            <Link
              href={`/notifications?notificationId=${row._id}`}
              shallow
              scroll={false}
              className="notice-open"
            >
              <div className="notice-card__heading">
                <h2>{notificationTitle(row.type)}</h2>
                <span className="notice-read-label">
                  {row.readAt ? 'Read' : 'Unread'}
                </span>
              </div>
              <p>{row.message}</p>
              <p className="care-meta">
                Notice recorded {timeLabel(row.occurredAt, 'UTC')} · UTC
              </p>
              <span className="notice-action">
                Open and check current details →
              </span>
            </Link>
          </article>
        ))}
      </div>
      {state.data?.nextCursor && pages < 50 && (
        <Button
          disabled={state.status === 'loading'}
          variant="outlined"
          onClick={() => setPages((value) => value + 1)}
        >
          Load more notifications
        </Button>
      )}
      {state.data?.nextCursor && pages >= 50 && (
        <p>
          Showing up to 1,000 notifications. Use the unread filter to focus this
          view.
        </p>
      )}
      {selected && (
        <NotificationDetail
          key={selected}
          id={selected}
          onClose={close}
          onRead={onRead}
        />
      )}
    </>
  );
}
