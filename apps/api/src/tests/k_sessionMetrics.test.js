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
import { createSessionMetricsRepository } from '../modules/queue/k_sessionMetricsRepository.js';
import { sessionMetricsRoutes } from '../modules/queue/k_sessionMetricsRoutes.js';
import { staffQueueRoutes } from '../modules/queue/k_queueRoutes.js';
import { staffSessionRoutes } from '../modules/sessions/k_sessionRoutes.js';
import { startHttp, startMongo } from './testServer.js';

const id = n => new ObjectId(n.toString(16).padStart(24, '0'));
const config = readAuthConfig({ JWT_SECRET: 'metrics-test-secret-'.repeat(4) });

test('M3-15 session metrics use consistent read-only MongoDB records', { timeout: 60000 }, async t => {
  const spawn = childProcess.spawn;
  const mock = process.platform === 'win32' ? t.mock.method(childProcess, 'spawn',
    (command, args, options) => spawn(command, args.filter(arg => arg !== '--nounixsocket'),
      { ...options, windowsHide: true })) : null;
  if (mock) syncBuiltinESMExports();
  let db;
  try { ({ db } = await startMongo(t)); }
  finally { if (mock) { mock.mock.restore(); syncBuiltinESMExports(); } }
  const hospitalId = id(1), sessionId = id(101), otherSession = id(102);
  await db.collection('hospitals').insertMany([{ _id: hospitalId, isActive: true },
    { _id: id(2), isActive: true }, { _id: id(3), isActive: false }]);
  await db.collection('opdSessions').insertMany([
    { _id: sessionId, hospitalId, status: 'RUNNING', capacity: 50, bookedCount: 35 },
    { _id: otherSession, hospitalId: id(2), status: 'OPEN', capacity: 50, bookedCount: 0 },
  ]);
  await db.collection('users').insertMany([
    ...['RECEPTION', 'NURSE', 'ADMIN', 'PATIENT', 'DOCTOR', 'UNKNOWN'].map((role, i) =>
      ({ _id: id(11 + i), role, status: 'ACTIVE', hospitalId })),
    { _id: id(17), role: 'RECEPTION', status: 'SUSPENDED', hospitalId },
    ...[null, hospitalId.toString(), id(999), id(3)].map((hospitalId, i) =>
      ({ _id: id(18 + i), role: 'RECEPTION', status: 'ACTIVE', hospitalId })),
  ]);
  const app = express(); app.set('query parser', 'simple');
  const auth = authenticate(db, config);
  app.use('/api/v1/staff/sessions', staffQueueRoutes(undefined, auth));
  app.use('/api/v1/staff/sessions', sessionMetricsRoutes(createSessionMetricsRepository(db), auth));
  app.use('/api/v1/staff/sessions', staffSessionRoutes(undefined, auth));
  app.use(errorHandler);
  const base = await startHttp(t, app), tokens = new Map();
  async function call({ user = 11, session = sessionId, query = '' } = {}) {
    if (user !== null && !tokens.has(user)) tokens.set(user, await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(id(user).toString()).setIssuer(config.issuer)
      .setAudience(config.audience).setIssuedAt().setExpirationTime('1h').sign(config.key));
    const response = await fetch(`${base}/api/v1/staff/sessions/${session}/metrics${query}`, {
      headers: user === null ? {} : { Authorization: `Bearer ${tokens.get(user)}` },
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  let serial = 200;
  async function fixture(fields = {}, patientFields = {}, bookingFields = {}) {
    const patientId = id(serial++), bookingId = id(serial++), entryId = id(serial++);
    const at = new Date('2026-10-06T03:00Z');
    await db.collection('users').insertOne({ _id: patientId, role: 'PATIENT', status: 'ACTIVE', fullName: 'Demo Patient',
      nic: '123456789V', passwordHash: 'secret', mobile: 'private', email: 'private', ...patientFields });
    await db.collection('bookings').insertOne({ _id: bookingId, sessionId, patientId, checkedInAt: at, status: 'CONFIRMED', ...bookingFields });
    const entry = { _id: entryId, bookingId, sessionId, patientId, queueNumber: serial, priorityLevel: 'NORMAL',
      status: 'WAITING', checkedInAt: at, updatedAt: at, ...fields };
    await db.collection('queueEntries').insertOne(entry);
    return entry;
  }
  async function clear() { await db.collection('queueEntries').deleteMany({}); }
  const empty = { sessionId: sessionId.toString(), status: 'RUNNING', capacity: 50, bookedCount: 35,
    waitingCount: 0, servingCount: 0, priorityCount: 0, patientsCheckedIn: 0, nowServing: null };
  await t.test('unauthenticated rejected', async () => assert.equal((await call({ user: null })).status, 401));
  for (const [user, role] of [[11, 'RECEPTION'], [12, 'NURSE'], [13, 'ADMIN']])
    await t.test(`${role} allowed`, async () => assert.equal((await call({ user })).status, 200));
  for (const user of [14, 15, 16, 17, 18, 19, 20, 21])
    await t.test(`role/account/hospital ${user} rejected`, async () => assert.equal((await call({ user })).status, 403));
  await t.test('invalid ID and query errors; unknown/cross-hospital same 404', async () => {
    assert.equal((await call({ session: 'invalid' })).status, 400);
    const unknown = await call({ session: id(999) });
    assert.equal(unknown.status, 404); assert.deepEqual(await call({ session: otherSession }), unknown);
    for (const query of ['?hospitalId=other', '?status=WAITING', '?limit=20']) {
      const result = await call({ query }); assert.equal(result.status, 400);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR'); assert.equal(result.body.success, false);
    }
  });
  await t.test('zero metrics, exact response contract, persisted session counters and no-store', async () => {
    const result = await call(); assert.equal(result.status, 200); assert.equal(result.cache, 'no-store');
    assert.deepEqual(result.body, { success: true, data: empty });
  });
  for (const priorityLevel of ['NORMAL', 'APPROVED_PRIORITY', 'EMERGENCY'])
    await t.test(`${priorityLevel} waiting counts use persisted priority`, async () => {
      await clear(); await fixture({ priorityLevel });
      assert.deepEqual((await call()).body.data, { ...empty, waitingCount: 1, patientsCheckedIn: 1,
        priorityCount: priorityLevel === 'NORMAL' ? 0 : 1 });
    });
  for (const status of ['CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED'])
    await t.test(`${status} counts are distinct from waiting`, async () => {
      await clear(); await fixture({ status, priorityLevel: 'APPROVED_PRIORITY' });
      assert.deepEqual((await call()).body.data, { ...empty, servingCount: ['CALLED', 'IN_CONSULTATION'].includes(status) ? 1 : 0,
        patientsCheckedIn: 1 });
    });
  await t.test('pending priority requests and corrupt partial bookings do not count', async () => {
    await clear();
    await db.collection('priorityRequests').insertOne({ sessionId, status: 'PENDING' });
    await db.collection('bookings').insertOne({ sessionId, patientId: id(999), checkedInAt: new Date() });
    assert.deepEqual((await call()).body.data, empty);
  });
  await t.test('cumulative count includes all five valid statuses', async () => {
    await clear();
    for (const status of ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED']) await fixture({ status });
    assert.deepEqual((await call()).body.data, { ...empty, waitingCount: 1, servingCount: 2, patientsCheckedIn: 5 });
  });
  await t.test('historical terminal check-in survives suspension; active metrics do not', async () => {
    await clear();
    for (const status of ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED'])
      await fixture({ status }, { status: 'SUSPENDED' });
    assert.deepEqual((await call()).body.data, { ...empty, patientsCheckedIn: 2 });
  });
  await t.test('latest valid calledAt and descending ObjectId choose formatted nowServing', async () => {
    await clear();
    await fixture({ status: 'CALLED', queueNumber: 99, calledAt: new Date('2026-10-06T03:30Z') });
    await fixture({ status: 'IN_CONSULTATION', queueNumber: 14, calledAt: new Date('2026-10-06T04:30Z') });
    assert.equal((await call()).body.data.nowServing, 'A-014');
    await fixture({ status: 'CALLED', queueNumber: 15, calledAt: new Date('2026-10-06T04:30Z') });
    assert.equal((await call()).body.data.nowServing, 'A-015');
  });
  await t.test('missing/malformed calledAt still serves but cannot become nowServing', async () => {
    await clear(); await fixture({ status: 'CALLED' });
    await fixture({ status: 'IN_CONSULTATION', calledAt: 'bad' });
    assert.deepEqual((await call()).body.data, { ...empty, servingCount: 2, patientsCheckedIn: 2 });
    await fixture({ status: 'CALLED', queueNumber: 1, calledAt: new Date('2026-10-06T03:30Z') });
    assert.equal((await call()).body.data.nowServing, 'A-001');
  });
  for (const fields of [{ queueNumber: 0 }, { queueNumber: 1.5 }, { queueNumber: 'A-001' },
    { priorityLevel: 'INVALID' }, { status: 'INVALID' }, { checkedInAt: 'bad' }, { updatedAt: new Date(0) },
    { patientId: id(999) }, { bookingId: id(999) }, { sessionId: [sessionId] }])
    await t.test(`isolated malformed record ${JSON.stringify(fields)} excluded`, async () => {
      await clear(); await fixture(fields); assert.deepEqual((await call()).body.data, empty);
    });
  for (const bookingFields of [{ patientId: id(999) }, { sessionId: otherSession }, { checkedInAt: new Date(0) }])
    await t.test(`inconsistent booking ${JSON.stringify(bookingFields)} excluded`, async () => {
      await clear(); await fixture({}, {}, bookingFields); assert.deepEqual((await call()).body.data, empty);
    });
  await t.test('non-PATIENT relationships excluded even for terminal entries', async () => {
    await clear(); await fixture({ status: 'COMPLETED' }, { role: 'NURSE' });
    assert.deepEqual((await call()).body.data, empty);
  });
  for (const changes of [{ status: 'INVALID' }, { capacity: 0 }, { capacity: '50' }, { capacity: 1.5 },
    { bookedCount: -1 }, { bookedCount: '0' }, { bookedCount: 51 }])
    await t.test(`invalid core session ${JSON.stringify(changes)} conflicts`, async () => {
      await db.collection('opdSessions').updateOne({ _id: sessionId }, { $set: changes });
      try {
        const result = await call(); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'SESSION_METRICS_CONFLICT');
      } finally { await db.collection('opdSessions').updateOne({ _id: sessionId }, { $set: { status: 'RUNNING', capacity: 50, bookedCount: 35 } }); }
    });
  await t.test('duplicate valid queue numbers conflict across terminal and active records', async () => {
    await clear(); await fixture({ queueNumber: 1 }); await fixture({ queueNumber: 1, status: 'COMPLETED' });
    const result = await call(); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'QUEUE_CONFLICT');
  });
  await t.test('duplicate valid bookings conflict', async () => {
    await clear(); const entry = await fixture();
    await db.collection('queueEntries').insertOne({ ...entry, _id: new ObjectId(), queueNumber: entry.queueNumber + 1 });
    assert.equal((await call()).body.error.code, 'QUEUE_CONFLICT');
  });
  await t.test('polling reflects changed MongoDB state and does not write any records', async () => {
    await clear(); const entry = await fixture();
    async function stored() { return Promise.all(['opdSessions', 'bookings', 'queueEntries', 'users', 'hospitals', 'priorityRequests', 'auditLogs']
      .map(name => db.collection(name).find({}).sort({ _id: 1 }).toArray())); }
    const before = await stored(); const first = await call(); assert.deepEqual(await call(), first);
    assert.deepEqual(await stored(), before);
    await db.collection('queueEntries').updateOne({ _id: entry._id }, { $set: { status: 'CALLED', calledAt: new Date() } });
    const updated = await stored(), next = await call();
    assert.equal(next.body.data.waitingCount, 0); assert.equal(next.body.data.servingCount, 1);
    assert.equal(next.body.data.patientsCheckedIn, 1); assert.ok(next.body.data.nowServing.startsWith('A-'));
    assert.deepEqual(await stored(), updated);
  });
});
