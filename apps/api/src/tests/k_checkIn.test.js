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
import { ensureQueueIndexes } from '../config/indexes.js';
import { createCheckInRepository } from '../modules/bookings/k_checkInRepository.js';
import { checkInRoutes } from '../modules/bookings/k_checkInRoutes.js';
import { startHttp, startMongo } from './testServer.js';

const id = n => new ObjectId(n.toString(16).padStart(24, '0'));
const config = readAuthConfig({ JWT_SECRET: 'check-in-test-secret-'.repeat(4) });

async function testMongo(t, replicaSet) {
  const spawn = childProcess.spawn;
  const mock = process.platform === 'win32' ? t.mock.method(childProcess, 'spawn',
    (command, args, options) => spawn(command, args.filter(arg => arg !== '--nounixsocket'),
      { ...options, windowsHide: true })) : null;
  if (mock) syncBuiltinESMExports();
  try { return await startMongo(t, { replicaSet }); }
  finally { if (mock) { mock.mock.restore(); syncBuiltinESMExports(); } }
}

test('M3-13 atomic staff-assisted check-in with real replica-set MongoDB', { timeout: 120000 }, async t => {
  const { db } = await testMongo(t, true);
  await ensureQueueIndexes(db);
  await ensureQueueIndexes(db);
  const hospitalId = id(1), otherHospital = id(2);
  await db.collection('hospitals').insertMany([
    { _id: hospitalId, isActive: true }, { _id: otherHospital, isActive: true }, { _id: id(3), isActive: false },
  ]);
  await db.collection('users').insertMany([
    ...['RECEPTION', 'NURSE', 'ADMIN', 'PATIENT', 'DOCTOR', 'UNKNOWN'].map((role, i) =>
      ({ _id: id(11 + i), role, status: 'ACTIVE', hospitalId })),
    { _id: id(17), role: 'RECEPTION', status: 'SUSPENDED', hospitalId },
    ...[null, hospitalId.toString(), id(999), id(3)].map((hospitalId, i) =>
      ({ _id: id(18 + i), role: 'RECEPTION', status: 'ACTIVE', hospitalId })),
  ]);
  let at = new Date('2026-10-05T18:30:00Z'); // Colombo midnight on October 6.
  let number = 100;
  const repository = createCheckInRepository(db, { now: () => new Date(at) });
  const app = express(); app.set('query parser', 'simple'); app.use(express.json());
  app.use('/api/v1/bookings', checkInRoutes(repository, authenticate(db, config)));
  app.use(errorHandler);
  const base = await startHttp(t, app);
  const tokens = new Map();
  async function call(bookingId, { user = 11, body, query = '' } = {}) {
    if (user !== null && !tokens.has(user)) tokens.set(user, await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(id(user).toString()).setIssuer(config.issuer)
      .setAudience(config.audience).setIssuedAt().setExpirationTime('1h').sign(config.key));
    const headers = user === null ? {} : { Authorization: `Bearer ${tokens.get(user)}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}/api/v1/bookings/${bookingId}/check-in${query}`, {
      method: 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  async function fixture({ sessionFields = {}, bookingFields = {}, patientFields = {}, sessionId } = {}) {
    const patientId = id(number++), bookingId = id(number++);
    await db.collection('users').insertOne({ _id: patientId, role: 'PATIENT', status: 'ACTIVE', fullName: 'Demo Patient', ...patientFields });
    if (!sessionId) {
      sessionId = id(number++);
      await db.collection('opdSessions').insertOne({ _id: sessionId, hospitalId, status: 'OPEN',
        sessionDate: new Date('2026-10-06T00:00:00Z'), startTime: '08:30', endTime: '12:30',
        capacity: 50, bookedCount: 10, ...sessionFields });
    }
    await db.collection('bookings').insertOne({ _id: bookingId, patientId, sessionId, status: 'CONFIRMED',
      bookingCode: `TEST-${bookingId}`, createdAt: new Date('2026-10-01T00:00Z'), updatedAt: new Date('2026-10-01T00:00Z'), ...bookingFields });
    return { bookingId, patientId, sessionId };
  }
  await t.test('unauthenticated request rejected', async () => assert.equal((await call(id(999), { user: null })).status, 401));
  for (const [user, role] of [[11, 'RECEPTION'], [12, 'NURSE'], [13, 'ADMIN']])
    await t.test(`${role} allowed with credential-free ACTIVE patient`, async () => {
      const f = await fixture(); assert.equal((await call(f.bookingId, { user })).status, 200);
    });
  for (const user of [14, 15, 16, 17, 18, 19, 20, 21])
    await t.test(`role/account/hospital ${user} rejected`, async () => assert.equal((await call(id(999), { user })).status, 403));
  await t.test('malformed ID, protected fields and query parameters are controlled errors', async () => {
    assert.equal((await call('invalid')).status, 400);
    const f = await fixture();
    for (const body of [null, [], 'text', ...['queueNumber', 'priorityLevel', 'checkedInAt', 'patientId', 'sessionId', 'hospitalId', 'status', 'unknown'].map(key => ({ [key]: 'client' }))]) {
      const result = await call(f.bookingId, { body });
      assert.equal(result.status, 400); assert.equal(result.body.success, false);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal((await call(f.bookingId, { query: '?hospitalId=other' })).status, 400);
    assert.equal(await db.collection('queueEntries').countDocuments({ bookingId: f.bookingId }), 0);
  });
  await t.test('unknown and cross-hospital bookings return identical safe 404', async () => {
    const f = await fixture({ sessionFields: { hospitalId: otherHospital } });
    const unknown = await call(id(999)), other = await call(f.bookingId);
    assert.equal(unknown.status, 404); assert.deepEqual(other, unknown);
  });
  await t.test('server timestamps, integer first number, minimal envelope and unchanged capacity', async () => {
    const f = await fixture(); const result = await call(f.bookingId, { body: {} });
    assert.equal(result.status, 200); assert.equal(result.cache, 'no-store');
    assert.deepEqual(result.body, { success: true, data: { bookingId: f.bookingId.toString(), sessionId: f.sessionId.toString(),
      queueNumber: 1, priorityLevel: 'NORMAL', status: 'WAITING', checkedInAt: at.toISOString(), updatedAt: at.toISOString() } });
    const booking = await db.collection('bookings').findOne({ _id: f.bookingId });
    const queue = await db.collection('queueEntries').findOne({ bookingId: f.bookingId });
    assert.deepEqual(booking.checkedInAt, queue.checkedInAt); assert.deepEqual(booking.updatedAt, at);
    assert.deepEqual(queue.createdAt, at);
    const session = await db.collection('opdSessions').findOne({ _id: f.sessionId });
    assert.equal(session.bookedCount, 10); assert.equal(session.capacity, 50);
    assert.equal(await db.collection('auditLogs').countDocuments({ action: 'BOOKING_CHECKED_IN', entityId: f.bookingId.toString() }), 1);
  });
  for (const status of ['OPEN', 'CLOSED', 'RUNNING'])
    await t.test(`${status} session allowed with no start/end cutoff`, async () => {
      const f = await fixture({ sessionFields: { status } });
      at = new Date('2026-10-06T18:00:00Z'); // 23:30, well after end.
      assert.equal((await call(f.bookingId)).status, 200);
      at = new Date('2026-10-05T18:30:00Z');
    });
  for (const status of ['CANCELLED', 'COMPLETED', 'SKIPPED', 'RESCHEDULED', 'INVALID'])
    await t.test(`booking ${status} rejected`, async () => {
      const f = await fixture({ bookingFields: { status } }); assert.equal((await call(f.bookingId)).status, 409);
    });
  for (const sessionFields of [{ status: 'CANCELLED' }, { status: 'COMPLETED' }, { status: 'INVALID' },
    { sessionDate: new Date('2026-10-05T00:00Z') }, { sessionDate: new Date('2026-10-07T00:00Z') },
    { sessionDate: new Date('2026-10-06T05:00Z') }, { sessionDate: '2026-10-06' }])
    await t.test(`invalid session ${JSON.stringify(sessionFields)}`, async () => {
      const f = await fixture({ sessionFields }); assert.equal((await call(f.bookingId)).status, 409);
    });
  await t.test('Colombo midnight is today although UTC date is yesterday', async () => {
    const f = await fixture(); assert.equal((await call(f.bookingId)).status, 200);
  });
  for (const patientFields of [{ status: 'SUSPENDED' }, { role: 'NURSE' }])
    await t.test(`invalid patient ${JSON.stringify(patientFields)}`, async () => {
      const f = await fixture({ patientFields }); assert.equal((await call(f.bookingId)).status, 409);
    });
  await t.test('dangling and malformed relationships fail safely', async () => {
    for (const bookingFields of [{ patientId: id(999) }, { sessionId: id(999) }, { patientId: 'bad' }, { sessionId: 'bad' }]) {
      const f = await fixture({ bookingFields }); assert.ok([404, 409].includes((await call(f.bookingId)).status));
      assert.equal(await db.collection('queueEntries').countDocuments({ bookingId: f.bookingId }), 0);
    }
  });
  for (const status of ['ACCEPTED', 'PENDING', 'DECLINED', null])
    await t.test(`priority ${status} at check-in`, async () => {
      const f = await fixture();
      if (status) await db.collection('priorityRequests').insertOne({ bookingId: f.bookingId, patientId: f.patientId, status });
      assert.equal((await call(f.bookingId)).body.data.priorityLevel, status === 'ACCEPTED' ? 'APPROVED_PRIORITY' : 'NORMAL');
    });
  await t.test('mismatched accepted priority does not approve another patient', async () => {
    const f = await fixture();
    await db.collection('priorityRequests').insertOne({ bookingId: f.bookingId, patientId: id(999), status: 'ACCEPTED' });
    assert.equal((await call(f.bookingId)).body.data.priorityLevel, 'NORMAL');
  });
  await t.test('replay preserves queue states, priority, timestamps and one audit after eligibility changes', async () => {
    const f = await fixture(); const first = await call(f.bookingId);
    await db.collection('opdSessions').updateOne({ _id: f.sessionId }, { $set: { status: 'COMPLETED', sessionDate: new Date('2026-10-01') } });
    await db.collection('bookings').updateOne({ _id: f.bookingId }, { $set: { status: 'COMPLETED' } });
    for (const status of ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED']) {
      await db.collection('queueEntries').updateOne({ bookingId: f.bookingId }, { $set: { status, priorityLevel: 'APPROVED_PRIORITY' } });
      const replay = await call(f.bookingId);
      assert.equal(replay.status, 200); assert.equal(replay.body.data.status, status);
      assert.equal(replay.body.data.priorityLevel, 'APPROVED_PRIORITY');
      assert.equal(replay.body.data.queueNumber, first.body.data.queueNumber);
      assert.equal(replay.body.data.checkedInAt, first.body.data.checkedInAt);
    }
    assert.equal(await db.collection('queueEntries').countDocuments({ bookingId: f.bookingId }), 1);
    assert.equal(await db.collection('auditLogs').countDocuments({ entityId: f.bookingId.toString() }), 1);
  });
  await t.test('concurrent same booking creates one entry and audit', async () => {
    const f = await fixture(); const results = await Promise.all(Array.from({ length: 6 }, () => call(f.bookingId)));
    results.forEach(result => assert.deepEqual(result, results[0]));
    assert.equal(results[0].status, 200);
    assert.equal(await db.collection('queueEntries').countDocuments({ bookingId: f.bookingId }), 1);
    assert.equal(await db.collection('auditLogs').countDocuments({ entityId: f.bookingId.toString() }), 1);
  });
  await t.test('concurrent distinct bookings get sequential numbers isolated per session', async () => {
    const first = await fixture(); const fixtures = [first];
    for (let i = 0; i < 5; i++) fixtures.push(await fixture({ sessionId: first.sessionId }));
    const results = await Promise.all(fixtures.map(f => call(f.bookingId)));
    results.forEach(r => assert.equal(r.status, 200));
    assert.deepEqual(results.map(r => r.body.data.queueNumber).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
    const separate = await fixture(); assert.equal((await call(separate.bookingId)).body.data.queueNumber, 1);
    await db.collection('queueEntries').updateMany({ sessionId: first.sessionId }, { $set: { status: 'SKIPPED' } });
    const next = await fixture({ sessionId: first.sessionId }); assert.equal((await call(next.bookingId)).body.data.queueNumber, 7);
  });
  await t.test('both unique indexes enforce duplicates', async () => {
    const f = await fixture(); await call(f.bookingId);
    const entry = await db.collection('queueEntries').findOne({ bookingId: f.bookingId });
    await assert.rejects(db.collection('queueEntries').insertOne({ ...entry, _id: new ObjectId(), queueNumber: 2 }), { code: 11000 });
    await assert.rejects(db.collection('queueEntries').insertOne({ ...entry, _id: new ObjectId(), bookingId: id(999) }), { code: 11000 });
  });
  await t.test('inconsistent timestamps or references are controlled conflicts', async () => {
    const alone = await fixture({ bookingFields: { checkedInAt: at } }); assert.equal((await call(alone.bookingId)).status, 409);
    for (const changes of [{ patientId: id(999) }, { sessionId: id(999) }, { checkedInAt: new Date(0) }, { queueNumber: 'A-001' }]) {
      const f = await fixture(); await call(f.bookingId);
      await db.collection('queueEntries').updateOne({ bookingId: f.bookingId }, { $set: changes });
      assert.equal((await call(f.bookingId)).body.error.code, 'CHECK_IN_CONFLICT');
    }
  });
  await t.test('audit failure rolls back booking, queue, session allocation and audit', async () => {
    const f = await fixture(); const original = db.collection.bind(db);
    const failure = t.mock.method(db, 'collection', name => name === 'auditLogs'
      ? { insertOne: async () => { throw new Error('private failure'); } } : original(name));
    try {
      const result = await call(f.bookingId); assert.equal(result.status, 500);
      assert.equal(result.body.error.code, 'INTERNAL_ERROR'); assert.ok(!JSON.stringify(result.body).includes('private failure'));
    } finally { failure.mock.restore(); }
    assert.equal((await db.collection('bookings').findOne({ _id: f.bookingId })).checkedInAt, undefined);
    assert.equal((await db.collection('opdSessions').findOne({ _id: f.sessionId })).checkInRevision, undefined);
    assert.equal(await db.collection('queueEntries').countDocuments({ bookingId: f.bookingId }), 0);
    assert.equal(await db.collection('auditLogs').countDocuments({ entityId: f.bookingId.toString() }), 0);
    assert.equal((await call(f.bookingId)).body.data.queueNumber, 1);
  });
  await t.test('real standalone MongoDB fails with 503 before any writes', async subtest => {
    const f = await fixture();
    const { db: standalone } = await testMongo(subtest, false);
    for (const [collection, ids] of [['users', [id(11), f.patientId]], ['hospitals', [hospitalId]],
      ['bookings', [f.bookingId]], ['opdSessions', [f.sessionId]]]) {
      for (const _id of ids) await standalone.collection(collection).insertOne(await db.collection(collection).findOne({ _id }));
    }
    await assert.rejects(createCheckInRepository(standalone).checkIn(id(11), f.bookingId), { status: 503, code: 'CHECK_IN_UNAVAILABLE' });
    assert.equal((await standalone.collection('bookings').findOne({ _id: f.bookingId })).checkedInAt, undefined);
    assert.equal(await standalone.collection('queueEntries').countDocuments({}), 0);
    assert.equal(await standalone.collection('auditLogs').countDocuments({}), 0);
  });
});
