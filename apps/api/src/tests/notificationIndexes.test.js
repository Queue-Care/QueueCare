import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureNotificationIndexes } from '../modules/notifications/g_notificationRepository.js';

test('notification startup reuses an equivalent legacy index and creates missing indexes', async () => {
  for (const indexes of [
    [{ name: 'userId_1_createdAt_-1', key: { userId: 1, createdAt: -1 } }],
    [{ name: 'notification_user_recent', key: { userId: 1, createdAt: -1 } }],
    [],
  ]) {
    let creates = 0;
    await ensureNotificationIndexes({ collection: () => ({
      listIndexes: () => ({ toArray: async () => indexes }),
      createIndex: async () => { creates++; },
    }) });
    assert.equal(creates, indexes.length ? 0 : 1);
  }
});

test('notification startup handles new collections but preserves database errors', async () => {
  for (const code of [26, 13]) {
    let creates = 0;
    const action = ensureNotificationIndexes({ collection: () => ({
      listIndexes: () => ({ toArray: async () => { throw Object.assign(new Error('database error'), { code }); } }),
      createIndex: async () => { creates++; },
    }) });
    if (code === 26) { await action; assert.equal(creates, 1); }
    else { await assert.rejects(action, { code: 13 }); assert.equal(creates, 0); }
  }
});
