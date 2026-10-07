import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { startMongo } from './testServer.js';
import { createIndexes } from '../config/indexes.js';
import { ensureNotificationIndexes } from '../modules/notifications/g_notificationRepository.js';
import { ensureNotificationUserRecentIndex } from '../config/notificationIndexes.js';

const keys = { userId: 1, createdAt: -1 };
const canonical = 'notification_user_recent';
const legacy = 'userId_1_createdAt_-1';

test('notification indexes on isolated MongoDB', async t => {
  const spawn = childProcess.spawn;
  const mock = process.platform === 'win32' ? t.mock.method(childProcess, 'spawn',
    (command, args, options) => spawn(command, args.filter(arg => arg !== '--nounixsocket'),
      { ...options, windowsHide: true })) : null;
  if (mock) syncBuiltinESMExports();
  let client;
  try { ({ client } = await startMongo(t)); }
  finally { if (mock) { mock.mock.restore(); syncBuiltinESMExports(); } }
  let number = 0;
  const database = () => client.db(`notification_indexes_${++number}`);

  await t.test('fresh collection creates the canonical index', async () => {
    const db = database();
    await ensureNotificationUserRecentIndex(db);
    const index = (await db.collection('notifications').listIndexes().toArray()).find(i => i.name === canonical);
    assert.deepEqual(index.key, keys);
    assert.equal(index.unique, undefined);
  });

  for (const name of [legacy, canonical]) {
    await t.test(`accepts ${name} and repeated initialization preserves indexes and documents`, async () => {
      const db = database(), collection = db.collection('notifications');
      await collection.insertOne({ userId: 'patient', title: 'Existing', createdAt: new Date('2026-10-06') });
      await collection.createIndex(keys, { name });
      await collection.createIndex({ title: 1 }, { name: 'unrelated_title' });
      const documents = await collection.find().toArray();
      const indexes = await collection.listIndexes().toArray();
      await ensureNotificationUserRecentIndex(db);
      await ensureNotificationIndexes(db);
      await ensureNotificationUserRecentIndex(db);
      assert.deepEqual(await collection.find().toArray(), documents);
      assert.deepEqual(await collection.listIndexes().toArray(), indexes);
    });
  }

  for (const repositoryFirst of [false, true]) {
    await t.test(`both initializers succeed, ${repositoryFirst ? 'repository' : 'config'} first`, async () => {
      const db = database();
      const initializers = repositoryFirst ? [ensureNotificationIndexes, createIndexes]
        : [createIndexes, ensureNotificationIndexes];
      for (const initialize of [...initializers, ...initializers]) await initialize(db);
      const indexes = await db.collection('notifications').listIndexes().toArray();
      assert.deepEqual(indexes.map(i => i.name).sort(), ['_id_', canonical].sort());
    });
  }

  for (const options of [{ unique: true }, { sparse: true },
    { partialFilterExpression: { userId: { $exists: true } } }, { hidden: true },
    { collation: { locale: 'en' } }]) {
    await t.test(`rejects incompatible options ${JSON.stringify(options)} without changes`, async () => {
      const db = database(), collection = db.collection('notifications');
      await collection.createIndex(keys, { name: legacy, ...options });
      const before = await collection.listIndexes().toArray();
      await assert.rejects(ensureNotificationUserRecentIndex(db), /Incompatible/);
      assert.deepEqual(await collection.listIndexes().toArray(), before);
    });
  }

  await t.test('rejects canonical name with different or reversed keys', async () => {
    for (const wrong of [{ userId: 1 }, { createdAt: -1, userId: 1 }]) {
      const db = database();
      await db.collection('notifications').createIndex(wrong, { name: canonical });
      await assert.rejects(ensureNotificationUserRecentIndex(db), /Incompatible/);
    }
  });

  await t.test('concurrent canonical initialization is idempotent', async () => {
    const db = database();
    await Promise.all(Array.from({ length: 5 }, () => ensureNotificationUserRecentIndex(db)));
    assert.equal((await db.collection('notifications').listIndexes().toArray()).length, 2);
  });

  for (const outcome of ['compatible', 'incompatible', 'absent']) {
    await t.test(`code 85 re-read handles ${outcome} concurrent index safely`, async () => {
      const db = database(), collection = db.collection('notifications');
      const conflict = Object.assign(new Error('Simulated concurrent index conflict'), { code: 85 });
      const scopedDb = { collection: () => ({
        listIndexes: () => collection.listIndexes(),
        createIndex: async () => {
          if (outcome !== 'absent') await collection.createIndex(keys,
            { name: legacy, ...(outcome === 'incompatible' ? { unique: true } : {}) });
          throw conflict;
        },
      }) };
      if (outcome === 'compatible') await ensureNotificationUserRecentIndex(scopedDb);
      else await assert.rejects(ensureNotificationUserRecentIndex(scopedDb), error => error === conflict);
    });
  }
});

test('unexpected database errors propagate and TTL definitions are incompatible', async () => {
  const failure = Object.assign(new Error('Database unavailable'), { code: 13 });
  await assert.rejects(ensureNotificationUserRecentIndex({ collection: () => ({
    listIndexes: () => ({ toArray: async () => { throw failure; } }),
  }) }), error => error === failure);
  // MongoDB rejects TTL on compound indexes itself; inspect legacy metadata defensively.
  await assert.rejects(ensureNotificationUserRecentIndex({ collection: () => ({
    listIndexes: () => ({ toArray: async () => [{ name: legacy, key: keys, expireAfterSeconds: 0 }] }),
  }) }), /Incompatible/);
});
