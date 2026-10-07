import { COLLECTIONS } from './collections.js';
import { ensureNotificationUserRecentIndex } from './notificationIndexes.js';

export async function ensureQueueIndexes(db) {
  await db.collection(COLLECTIONS.QUEUE_ENTRIES).createIndex({ bookingId: 1 }, { unique: true });
  await db.collection(COLLECTIONS.QUEUE_ENTRIES).createIndex(
    { sessionId: 1, queueNumber: 1 }, { unique: true }
  );
}

export async function createIndexes(db) {
  await db.collection(COLLECTIONS.USERS).createIndex(
    { mobile: 1 },
    { unique: true, sparse: true }
  );

  await db.collection(COLLECTIONS.OPD_SESSIONS).createIndex({
    hospitalId: 1,
    sessionDate: 1,
    status: 1,
  });

  await db.collection(COLLECTIONS.BOOKINGS).createIndex(
    { bookingReference: 1 },
    { unique: true, sparse: true }
  );

  await db.collection(COLLECTIONS.BOOKINGS).createIndex({
    patientId: 1,
    createdAt: -1,
  });

  await ensureQueueIndexes(db);

  await db.collection(COLLECTIONS.QUEUE_ENTRIES).createIndex({
    sessionId: 1,
    status: 1,
    queueNumber: 1,
  });

  await db.collection(COLLECTIONS.PRIORITY_REQUESTS).createIndex({
    bookingId: 1,
    status: 1,
  });

  await ensureNotificationUserRecentIndex(db);

  console.log('MongoDB indexes created successfully');
}
