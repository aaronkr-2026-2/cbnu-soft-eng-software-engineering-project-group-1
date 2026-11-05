import { careRequest } from './booking';
import * as docs from '../../apollo/user/notification';
import type {
  NotificationContext,
  NotificationPage,
  PatientNotification,
} from '../../types/notification';
export async function myNotifications(
  input: { limit?: number; after?: string; unreadOnly?: boolean },
  signal: AbortSignal,
) {
  return (
    await careRequest<{ myNotifications: NotificationPage }>(
      docs.MY_NOTIFICATIONS,
      { input },
      signal,
    )
  ).myNotifications;
}
export async function getNotification(id: string, signal: AbortSignal) {
  return (
    await careRequest<{ getNotification: PatientNotification }>(
      docs.GET_NOTIFICATION,
      { id },
      signal,
    )
  ).getNotification;
}
export async function notificationContext(id: string, signal: AbortSignal) {
  return (
    await careRequest<{ notificationContext: NotificationContext }>(
      docs.NOTIFICATION_CONTEXT,
      { id },
      signal,
    )
  ).notificationContext;
}
export async function markNotificationRead(id: string, signal: AbortSignal) {
  return (
    await careRequest<{ markNotificationRead: PatientNotification }>(
      docs.MARK_READ,
      { id },
      signal,
      true,
      true,
    )
  ).markNotificationRead;
}
// Refresh the number of pages the patient has chosen to display, starting at the
// newest item each time. This incorporates newly delivered notices without merging
// stale unread-filter results or accumulating duplicate IDs.
export async function notificationPages(
  unreadOnly: boolean,
  pages: number,
  signal: AbortSignal,
): Promise<NotificationPage> {
  const rows = new Map<string, PatientNotification>();
  let after: string | undefined,
    unreadCount = 0,
    nextCursor: string | null = null;
  for (let page = 0; page < Math.max(1, Math.min(50, pages)); page++) {
    signal.throwIfAborted();
    const result = await myNotifications(
      { limit: 20, unreadOnly, ...(after ? { after } : {}) },
      signal,
    );
    for (const row of result.entries) rows.set(row._id, row);
    unreadCount = result.unreadCount;
    nextCursor = result.nextCursor;
    if (!nextCursor) break;
    if (nextCursor === after)
      throw new Error('Notification pagination changed. Refresh to try again.');
    after = nextCursor;
  }
  return {
    entries: [...rows.values()].sort(
      (a, b) =>
        +new Date(b.occurredAt) - +new Date(a.occurredAt) ||
        b._id.localeCompare(a._id),
    ),
    nextCursor,
    unreadCount,
  };
}
