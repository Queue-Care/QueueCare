import {
  apiRequest,
  isRecord,
  isText,
  unreadableResponse,
} from '../../api/g_apiClient';
import { colomboDate } from '../priority/g_priorityRequests';

export type NotificationType =
  | 'BOOKING'
  | 'REMINDER'
  | 'QUEUE'
  | 'PRIORITY'
  | 'SESSION'
  | 'SYSTEM';
export type AppNotification = {
  _id: string;
  type: NotificationType;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
export type NotificationList = {
  notifications: AppNotification[];
  unreadCount: number;
};

const types = ['BOOKING', 'REMINDER', 'QUEUE', 'PRIORITY', 'SESSION', 'SYSTEM'];

export function parseNotification(value: unknown): AppNotification {
  if (
    !isRecord(value) ||
    !isText(value._id) ||
    !isText(value.title) ||
    typeof value.message !== 'string' ||
    !isText(value.createdAt) ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw unreadableResponse();
  return {
    _id: value._id,
    type: types.includes(String(value.type))
      ? (value.type as NotificationType)
      : 'SYSTEM',
    title: value.title,
    message: value.message,
    readAt: isText(value.readAt) ? value.readAt : null,
    createdAt: value.createdAt,
  };
}

const unread = (meta: Record<string, unknown>) =>
  typeof meta.unreadCount === 'number' ? meta.unreadCount : 0;

export async function fetchNotifications(
  token: string | undefined,
  signal?: AbortSignal,
): Promise<NotificationList> {
  const { data, meta } = await apiRequest('/notifications', { token, signal });
  if (!Array.isArray(data)) throw unreadableResponse();
  return {
    notifications: data.map(parseNotification),
    unreadCount: unread(meta),
  };
}

export async function markNotificationRead(
  token: string | undefined,
  notificationId: string,
) {
  const { data } = await apiRequest(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { token, method: 'PATCH' },
  );
  return parseNotification(data);
}

export async function markAllNotificationsRead(token: string | undefined) {
  await apiRequest('/notifications/read-all', { token, method: 'PATCH' });
}

export async function deleteNotification(
  token: string | undefined,
  notificationId: string,
) {
  await apiRequest(`/notifications/${encodeURIComponent(notificationId)}`, {
    token,
    method: 'DELETE',
  });
}

// "10 minutes ago", "Yesterday · 6:18 PM", "20 Sep" as in the prototype.
export function formatWhen(iso: string, now = new Date()) {
  const date = new Date(iso);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const when = colomboDate(date);
  const sameDay = (other: Date) => {
    const parts = colomboDate(other);
    return (
      parts.day === when.day &&
      parts.month === when.month &&
      parts.year === when.year
    );
  };
  if (sameDay(now)) return `Today · ${when.time}`;
  if (sameDay(new Date(now.getTime() - 24 * 60 * 60 * 1000)))
    return `Yesterday · ${when.time}`;
  return `${when.day} ${when.month}`;
}
