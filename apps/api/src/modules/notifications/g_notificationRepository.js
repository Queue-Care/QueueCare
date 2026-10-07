import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

const TYPES = ['BOOKING', 'REMINDER', 'QUEUE', 'PRIORITY', 'SESSION', 'SYSTEM'];
const LIST_LIMIT = 50;

export async function ensureNotificationIndexes(db) {
  const notifications = db.collection('notifications');
  let indexes;
  try {
    indexes = await notifications.listIndexes().toArray();
  } catch (error) {
    if (error.code !== 26) throw error; // A fresh database has no collection yet.
    indexes = [];
  }
  // Older databases use MongoDB's default name for this same index.
  // Reuse it instead of creating an equivalent index with another name.
  const compatible = indexes.some(index =>
    Object.keys(index.key).length === 2 &&
    Object.keys(index.key)[0] === 'userId' && index.key.userId === 1 &&
    Object.keys(index.key)[1] === 'createdAt' && index.key.createdAt === -1 &&
    !index.unique && !index.sparse && !index.partialFilterExpression && !index.collation
  );
  if (!compatible) await notifications.createIndex(
    { userId: 1, createdAt: -1 }, { name: 'notification_user_recent' }
  );
}

// Shared producer for in-app notifications (README section 20). No push/SMS/email.
export async function insertNotification(
  db,
  { userId, type, title, message, data = {}, createdAt = new Date() },
  options = {}
) {
  const notification = {
    _id: new ObjectId(),
    userId,
    type,
    title,
    message,
    data,
    readAt: null,
    createdAt,
  };
  await db.collection('notifications').insertOne(notification, options);
  return notification;
}

function toPublic(notification) {
  const createdAt =
    notification.createdAt instanceof Date
      ? notification.createdAt
      : notification._id.getTimestamp();
  return {
    _id: notification._id.toString(),
    type: TYPES.includes(notification.type) ? notification.type : 'SYSTEM',
    title: String(notification.title ?? ''),
    message: String(notification.message ?? ''),
    // ObjectId and Date values inside data are serialised by JSON as strings.
    data: notification.data ?? {},
    readAt:
      notification.readAt instanceof Date
        ? notification.readAt.toISOString()
        : null,
    createdAt: createdAt.toISOString(),
  };
}

const notFound = () =>
  new HttpError(404, 'NOT_FOUND', 'Notification not found.');

export function createNotificationRepository(
  db,
  { now = () => new Date() } = {}
) {
  const notifications = db.collection('notifications');
  const unreadCount = (userId) =>
    notifications.countDocuments({ userId, readAt: null }, { maxTimeMS: 3000 });

  return {
    unreadCount,

    async list(userId) {
      const [items, unread] = await Promise.all([
        notifications
          .find({ userId }, { maxTimeMS: 3000 })
          .sort({ createdAt: -1, _id: -1 })
          .limit(LIST_LIMIT)
          .toArray(),
        unreadCount(userId),
      ]);
      return { items: items.map(toPublic), unreadCount: unread };
    },

    // Another user's notification is indistinguishable from a missing one.
    async markRead(userId, notificationId) {
      const existing = await notifications.findOne({
        _id: notificationId,
        userId,
      });
      if (!existing) throw notFound();
      if (existing.readAt instanceof Date) return toPublic(existing);
      const readAt = now();
      await notifications.updateOne(
        { _id: notificationId, userId, readAt: null },
        { $set: { readAt } }
      );
      return toPublic({ ...existing, readAt });
    },

    async markAllRead(userId) {
      const result = await notifications.updateMany(
        { userId, readAt: null },
        { $set: { readAt: now() } }
      );
      return { updated: result.modifiedCount };
    },

    async remove(userId, notificationId) {
      const result = await notifications.deleteOne({
        _id: notificationId,
        userId,
      });
      if (result.deletedCount !== 1) throw notFound();
      return { _id: notificationId.toString() };
    },
  };
}
