import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import express from 'express';
import { ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { readAuthConfig } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { createQueueRepository } from '../modules/queue/k_queueRepository.js';
import { staffQueueRoutes } from '../modules/queue/k_queueRoutes.js';
import { staffSessionRoutes } from '../modules/sessions/k_sessionRoutes.js';
import { compareQueueEntries, AVERAGE_CONSULTATION_MINUTES } from '../modules/queue/k_queueService.js';
import { startHttp, startMongo } from './testServer.js';

const id = n => new ObjectId(n.toString(16).padStart(24, '0'));
const config = readAuthConfig({ JWT_SECRET: 'queue-read-test-secret-'.repeat(4) });
test('queue comparator uses time and ObjectId for deterministic ties', () => {
  const entry = { _id: id(1), priorityLevel: 'NORMAL', queueNumber: 1, checkedInAt: new Date(0) };
  assert.ok(compareQueueEntries(entry, { ...entry, checkedInAt: new Date(1) }) < 0);
  assert.ok(compareQueueEntries(entry, { ...entry, _id: id(2) }) < 0);
  assert.equal(AVERAGE_CONSULTATION_MINUTES, 10);
});

test('M3-14 read-only hospital queue snapshot from real MongoDB', { timeout: 60000 }, async t => {
  const spawn = childProcess.spawn;
  const mock = process.platform === 'win32' ? t.mock.method(childProcess, 'spawn',
    (command, args, options) => spawn(command, args.filter(arg => arg !== '--nounixsocket'),
      { ...options, windowsHide: true })) : null;
  if (mock) syncBuiltinESMExports();
  let db;
  try { ({ db } = await startMongo(t)); }
  finally { if (mock) { mock.mock.restore(); syncBuiltinESMExports(); } }
  const hospitalId = id(1), sessionId = id(101), otherSessionId = id(102);
  await db.collection('hospitals').insertMany([{ _id: hospitalId, isActive: true },
    { _id: id(2), isActive: true }, { _id: id(3), isActive: false }]);
  await db.collection('opdSessions').insertMany([{ _id: sessionId, hospitalId }, { _id: otherSessionId, hospitalId: id(2) }]);
  await db.collection('users').insertMany([
    ...['RECEPTION', 'NURSE', 'ADMIN', 'PATIENT', 'DOCTOR', 'UNKNOWN'].map((role, i) =>
      ({ _id: id(11 + i), role, status: 'ACTIVE', hospitalId })),
    { _id: id(17), role: 'RECEPTION', status: 'SUSPENDED', hospitalId },
    ...[null, hospitalId.toString(), id(999), id(3)].map((hospitalId, i) =>
      ({ _id: id(18 + i), role: 'RECEPTION', status: 'ACTIVE', hospitalId })),
  ]);
  const app = express(); app.set('query parser', 'simple');
  app.use('/api/v1/staff/sessions', staffQueueRoutes(createQueueRepository(db), authenticate(db, config)));
  // Same registration order as app.js: queue path must not hit session middleware.
  app.use('/api/v1/staff/sessions', staffSessionRoutes(undefined, authenticate(db, config)));
  app.use(errorHandler);
  const base = await startHttp(t, app), tokens = new Map();
  async function call({ user = 11, session = sessionId, query = '' } = {}) {
    if (user !== null && !tokens.has(user)) tokens.set(user, await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(id(user).toString()).setIssuer(config.issuer)
      .setAudience(config.audience).setIssuedAt().setExpirationTime('1h').sign(config.key));
    const response = await fetch(`${base}/api/v1/staff/sessions/${session}/queue${query}`, {
      headers: user === null ? {} : { Authorization: `Bearer ${tokens.get(user)}` },
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  let serial = 200;
  async function fixture(fields = {}, patientFields = {}, bookingFields = {}) {
    const patientId = id(serial++), bookingId = id(serial++), queueEntryId = id(serial++);
    const at = new Date('2026-10-06T03:00Z');
    await db.collection('users').insertOne({ _id: patientId, role: 'PATIENT', status: 'ACTIVE', fullName: `Patient ${patientId}`,
      nic: '123456789V', mobile: 'private', email: 'private', passwordHash: 'secret', verificationId: 'secret', ...patientFields });
    await db.collection('bookings').insertOne({ _id: bookingId, patientId, sessionId, checkedInAt: at, status: 'CONFIRMED', ...bookingFields });
    const entry = { _id: queueEntryId, patientId, bookingId, sessionId, queueNumber: serial,
      priorityLevel: 'NORMAL', status: 'WAITING', checkedInAt: at, updatedAt: at, ...fields };
    await db.collection('queueEntries').insertOne(entry);
    return entry;
  }
  async function clear() { await db.collection('queueEntries').deleteMany({}); }
  await t.test('unauthenticated rejected', async () => assert.equal((await call({ user: null })).status, 401));
  for (const [user, role] of [[11, 'RECEPTION'], [12, 'NURSE'], [13, 'ADMIN']])
    await t.test(`${role} allowed`, async () => assert.equal((await call({ user })).status, 200));
  for (const user of [14, 15, 16, 17, 18, 19, 20, 21])
    await t.test(`disallowed role/account/hospital ${user}`, async () => assert.equal((await call({ user })).status, 403));
  await t.test('invalid ID, unknown/cross-hospital sessions, and query overrides', async () => {
    assert.equal((await call({ session: 'invalid' })).status, 400);
    const unknown = await call({ session: id(999) });
    assert.equal(unknown.status, 404); assert.deepEqual(await call({ session: otherSessionId }), unknown);
    for (const query of ['?hospitalId=other', '?limit=20', '?status=WAITING']) {
      const result = await call({ query }); assert.equal(result.status, 400);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR'); assert.equal(result.body.success, false);
    }
  });
  await t.test('empty queue is successful with default and no-store', async () => {
    const result = await call(); assert.equal(result.cache, 'no-store');
    assert.deepEqual(result.body, { success: true, data: { sessionId: sessionId.toString(), averageConsultationMinutes: 10, queue: [] } });
  });
  await t.test('single WAITING patient receives rank 1 and zero ahead/wait', async () => {
    const entry = await fixture({ queueNumber: 1 });
    const item = (await call()).body.data.queue[0];
    assert.equal(item.queueEntryId, entry._id.toString());
    assert.equal(item.position, 1); assert.equal(item.patientsAhead, 0); assert.equal(item.estimatedWaitMinutes, 0);
  });
  await t.test('priority order, normal FIFO, positions and wait default are derived without renumbering', async () => {
    await clear();
    const normal2 = await fixture({ queueNumber: 2 }), normal1 = await fixture({ queueNumber: 1 });
    const approved2 = await fixture({ queueNumber: 4, priorityLevel: 'APPROVED_PRIORITY' });
    const approved1 = await fixture({ queueNumber: 3, priorityLevel: 'APPROVED_PRIORITY' });
    const emergency = await fixture({ queueNumber: 5, priorityLevel: 'EMERGENCY' });
    const result = await call();
    assert.deepEqual(result.body.data.queue.map(q => q.queueEntryId), [emergency, approved1, approved2, normal1, normal2].map(e => e._id.toString()));
    assert.deepEqual(result.body.data.queue.map(q => [q.position, q.patientsAhead, q.estimatedWaitMinutes]),
      [[1, 0, 0], [2, 1, 10], [3, 2, 20], [4, 3, 30], [5, 4, 40]]);
    assert.deepEqual(result.body.data.queue.map(q => q.queueNumber), [5, 3, 4, 1, 2]);
  });
  await t.test('mixed statuses: serving included without rank; completed/skipped excluded', async () => {
    await clear();
    await fixture({ queueNumber: 1, status: 'CALLED' }); await fixture({ queueNumber: 2, status: 'IN_CONSULTATION' });
    await fixture({ queueNumber: 3 }); await fixture({ queueNumber: 4 });
    await fixture({ queueNumber: 5, status: 'COMPLETED' }); await fixture({ queueNumber: 6, status: 'SKIPPED' });
    const queue = (await call()).body.data.queue;
    assert.deepEqual(queue.map(q => q.status), ['WAITING', 'WAITING', 'CALLED', 'IN_CONSULTATION']);
    assert.deepEqual(queue.slice(0, 2).map(q => q.patientsAhead), [0, 1]);
    for (const item of queue.slice(2)) {
      assert.equal(item.position, null); assert.equal(item.patientsAhead, null); assert.equal(item.estimatedWaitMinutes, null);
    }
  });
  await t.test('minimal safe identity only', async () => {
    const queue = (await call()).body.data.queue;
    for (const item of queue) assert.deepEqual(Object.keys(item).sort(), ['queueEntryId', 'bookingId', 'patientId', 'fullName',
      'queueNumber', 'priorityLevel', 'status', 'checkedInAt', 'updatedAt', 'position', 'patientsAhead', 'estimatedWaitMinutes'].sort());
    assert.ok(!JSON.stringify(queue).includes('secret')); assert.ok(!JSON.stringify(queue).includes('123456789V'));
  });
  for (const fields of [{ queueNumber: 0 }, { queueNumber: -1 }, { queueNumber: 1.5 }, { queueNumber: 'A-001' },
    { queueNumber: Number.MAX_SAFE_INTEGER + 1 }, { priorityLevel: 'INVALID' }, { status: 'INVALID' },
    { checkedInAt: 'bad' }, { updatedAt: new Date(0) }, { sessionId: [sessionId] },
    { patientId: id(999) }, { bookingId: id(999) }, { patientId: 'invalid' }])
    await t.test(`malformed queue ${JSON.stringify(fields)} excluded before rank`, async () => {
      await clear(); await fixture(fields); await fixture({ queueNumber: 100 });
      const result = await call(); assert.equal(result.status, 200);
      assert.equal(result.body.data.queue.length, 1); assert.equal(result.body.data.queue[0].position, 1);
    });
  for (const patientFields of [{ status: 'SUSPENDED' }, { role: 'NURSE' }, { fullName: ['invalid'] }])
    await t.test(`invalid patient ${JSON.stringify(patientFields)} excluded`, async () => {
      await clear(); await fixture({}, patientFields); assert.deepEqual((await call()).body.data.queue, []);
    });
  for (const bookingFields of [{ patientId: id(999) }, { sessionId: otherSessionId }, { checkedInAt: new Date(0) }])
    await t.test(`mismatched booking ${JSON.stringify(bookingFields)} excluded`, async () => {
      await clear(); await fixture({}, {}, bookingFields); assert.deepEqual((await call()).body.data.queue, []);
    });
  await t.test('duplicate valid active numbers produce controlled conflict', async () => {
    await clear(); await fixture({ queueNumber: 1 }); await fixture({ queueNumber: 1 });
    const result = await call(); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'QUEUE_CONFLICT');
  });
  await t.test('duplicate valid active bookings produce controlled conflict', async () => {
    await clear(); const entry = await fixture({ queueNumber: 1 });
    await db.collection('queueEntries').insertOne({ ...entry, _id: new ObjectId(), queueNumber: 2 });
    assert.equal((await call()).body.error.code, 'QUEUE_CONFLICT');
  });
  await t.test('invalid duplicates are excluded rather than causing ambiguous ranks', async () => {
    await clear(); const entry = await fixture({ queueNumber: 1 });
    await db.collection('queueEntries').insertOne({ ...entry, _id: new ObjectId(), priorityLevel: 'INVALID' });
    assert.equal((await call()).body.data.queue.length, 1);
  });
  await t.test('complete >20 snapshot is deterministic and causes no database writes', async () => {
    await clear();
    for (let i = 1; i <= 25; i++) await fixture({ queueNumber: i });
    async function stored() {
      return Promise.all(['queueEntries', 'users', 'bookings', 'opdSessions', 'hospitals', 'priorityRequests', 'auditLogs']
        .map(name => db.collection(name).find({}).sort({ _id: 1 }).toArray()));
    }
    const before = await stored(), first = await call(), second = await call();
    assert.equal(first.body.data.queue.length, 25); assert.equal(first.body.data.queue[24].estimatedWaitMinutes, 240);
    assert.deepEqual(second, first); assert.deepEqual(await stored(), before);
  });
});
