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
import { createQueueMutationRepository } from '../modules/queue/k_queueMutationRepository.js';
import { queueMutationRoutes } from '../modules/queue/k_queueMutationRoutes.js';
import { createSessionMetricsRepository } from '../modules/queue/k_sessionMetricsRepository.js';
import { compareQueueEntries } from '../modules/queue/k_queueService.js';
import { startHttp, startMongo } from './testServer.js';

const id = n => new ObjectId(n.toString(16).padStart(24, '0'));
const config = readAuthConfig({ JWT_SECRET: 'queue-mutation-test-secret-'.repeat(4) });
const at = new Date('2026-10-06T03:00:00Z');
const checked = new Date('2026-10-06T02:00:00Z');
const statuses = ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED'];
const edges = { WAITING: ['SKIPPED'], CALLED: ['IN_CONSULTATION', 'SKIPPED'],
  IN_CONSULTATION: ['COMPLETED', 'SKIPPED'], COMPLETED: [], SKIPPED: [] };

async function testMongo(t, replicaSet) {
  const spawn = childProcess.spawn;
  const mock = process.platform === 'win32' ? t.mock.method(childProcess, 'spawn',
    (command, args, options) => spawn(command, args.filter(arg => arg !== '--nounixsocket'),
      { ...options, windowsHide: true })) : null;
  if (mock) syncBuiltinESMExports();
  try { return await startMongo(t, { replicaSet }); }
  finally { if (mock) { mock.mock.restore(); syncBuiltinESMExports(); } }
}

test('M3-16 transactional queue mutations', { timeout: 120000 }, async t => {
  const { db } = await testMongo(t, true);
  await ensureQueueIndexes(db);
  const hospitalId = id(1), sessionId = id(100), otherSession = id(101);
  await db.collection('hospitals').insertMany([{ _id: hospitalId, isActive: true },
    { _id: id(2), isActive: true }, { _id: id(3), isActive: false }]);
  await db.collection('users').insertMany([
    ...['DOCTOR', 'ADMIN', 'RECEPTION', 'NURSE', 'PATIENT', 'UNKNOWN'].map((role, i) =>
      ({ _id: id(11 + i), hospitalId, role, status: 'ACTIVE' })),
    { _id: id(17), hospitalId, role: 'DOCTOR', status: 'SUSPENDED' },
    ...[null, hospitalId.toString(), id(999), id(3)].map((hospitalId, i) =>
      ({ _id: id(18 + i), hospitalId, role: 'DOCTOR', status: 'ACTIVE' })),
  ]);
  const baseSession = { _id: sessionId, hospitalId, status: 'OPEN', sessionDate: new Date('2026-10-06T00:00Z'),
    capacity: 100, bookedCount: 10 };
  await db.collection('opdSessions').insertMany([baseSession, { ...baseSession, _id: otherSession, hospitalId: id(2) }]);
  let clock = at;
  const repository = createQueueMutationRepository(db, { now: () => clock });
  const metrics = createSessionMetricsRepository(db);
  const app = express(); app.set('query parser', 'simple'); app.use(express.json());
  app.use('/api/v1/staff', queueMutationRoutes(repository, authenticate(db, config))); app.use(errorHandler);
  const base = await startHttp(t, app), tokens = new Map();
  async function call({ user = 11, entry, session = sessionId, body, query = '' } = {}) {
    if (user !== null && !tokens.has(user)) tokens.set(user, await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(id(user).toString()).setIssuer(config.issuer)
      .setAudience(config.audience).setIssuedAt().setExpirationTime('1h').sign(config.key));
    const path = entry === undefined ? `sessions/${session}/queue/next` : `queue/${entry}/status`;
    const response = await fetch(`${base}/api/v1/staff/${path}${query}`, {
      method: entry === undefined ? 'POST' : 'PATCH',
      headers: { ...(user === null ? {} : { Authorization: `Bearer ${tokens.get(user)}` }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  let serial = 200;
  async function fixture(fields = {}, bookingFields = {}, patientFields = {}) {
    const patientId = id(serial++), bookingId = id(serial++), entryId = id(serial++);
    const status = fields.status ?? 'WAITING';
    const entry = { _id: entryId, patientId, bookingId, sessionId, queueNumber: serial,
      priorityLevel: 'NORMAL', status, checkedInAt: checked, createdAt: checked, updatedAt: checked,
      ...(['CALLED', 'IN_CONSULTATION', 'COMPLETED'].includes(status) ? { calledAt: checked } : {}),
      ...(status === 'COMPLETED' ? { completedAt: checked } : {}), ...fields };
    await db.collection('users').insertOne({ _id: patientId, role: 'PATIENT', status: 'ACTIVE', fullName: 'Demo Patient',
      passwordHash: 'private', mobile: 'private', ...patientFields });
    await db.collection('bookings').insertOne({ _id: bookingId, sessionId: entry.sessionId, patientId,
      checkedInAt: checked, status: ['COMPLETED', 'SKIPPED'].includes(status) ? status : 'CONFIRMED', ...bookingFields });
    await db.collection('queueEntries').insertOne(entry);
    return entry;
  }
  async function reset() {
    clock = at;
    await db.collection('queueEntries').deleteMany({}); await db.collection('auditLogs').deleteMany({});
    await db.collection('opdSessions').replaceOne({ _id: sessionId }, baseSession);
  }
  async function snapshot() {
    const result = {};
    for (const name of ['users', 'hospitals', 'opdSessions', 'bookings', 'queueEntries', 'auditLogs'])
      result[name] = await db.collection(name).find().sort({ _id: 1 }).toArray();
    return result;
  }
  for (const entry of [undefined, id(999)]) {
    await t.test(`unauthenticated ${entry === undefined ? 'call' : 'patch'}`, async () =>
      assert.equal((await call({ user: null, entry, body: entry ? { status: 'SKIPPED' } : undefined })).status, 401));
    for (const user of [13, 14, 15, 16, 17, 18, 19, 20, 21])
      await t.test(`role/linkage ${user} rejected ${entry === undefined ? 'call' : 'patch'}`, async () =>
        assert.equal((await call({ user, entry, body: entry ? { status: 'SKIPPED' } : undefined })).status, 403));
  }
  for (const user of [11, 12]) await t.test(`actor ${user} allowed; empty is read-only`, async () => {
    await reset(); const before = await snapshot();
    const response = await call({ user, body: {} }); assert.equal(response.status, 200);
    assert.deepEqual(response.body, { success: true, data: null }); assert.equal(response.cache, 'no-store');
    assert.deepEqual(await snapshot(), before);
    const entry = await fixture(); assert.equal((await call({ user, entry: entry._id, body: { status: 'SKIPPED' } })).status, 200);
  });
  await t.test('invalid, unknown and cross-hospital resource IDs', async () => {
    await reset(); const other = await fixture({ sessionId: otherSession });
    for (const entry of [undefined, 'bad']) assert.equal((await call({ entry, session: 'bad', body: entry ? { status: 'SKIPPED' } : {} })).status, 400);
    const unknown = await call({ session: id(999) });
    assert.equal(unknown.status, 404); assert.deepEqual(await call({ session: otherSession }), unknown);
    const unknownEntry = await call({ entry: id(999), body: { status: 'SKIPPED' } });
    assert.equal(unknownEntry.status, 404); assert.deepEqual(await call({ entry: other._id, body: { status: 'SKIPPED' } }), unknownEntry);
  });
  await t.test('protected fields, malformed bodies and query parameters rejected', async () => {
    await reset(); const entry = await fixture(); const before = await snapshot();
    for (const body of [null, [], 'bad', { patientId: id(1) }, { queueEntryId: entry._id }, { queueNumber: 1 }, { priority: 'EMERGENCY' }, { calledAt: at }])
      assert.equal((await call({ body })).status, 400);
    for (const body of [undefined, null, [], {}, { status: 'bad' },
      ...['patientId', 'sessionId', 'bookingId', 'hospitalId', 'queueNumber', 'priorityLevel', 'checkedInAt', 'calledAt', 'completedAt', 'updatedAt'].map(key => ({ status: 'SKIPPED', [key]: 'override' }))])
      assert.equal((await call({ entry: entry._id, body })).status, 400);
    for (const query of ['?hospitalId=other', '?q=x', '?status=WAITING']) {
      assert.equal((await call({ query })).status, 400);
      assert.equal((await call({ entry: entry._id, body: { status: 'SKIPPED' }, query })).status, 400);
    }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('malformed array hospital linkage cannot match a scoped session', async () => {
    await reset(); const entry = await fixture();
    await db.collection('opdSessions').updateOne({ _id: sessionId }, { $set: { hospitalId: [hospitalId, id(2)] } });
    assert.equal((await call()).status, 404);
    assert.equal((await call({ entry: entry._id, body: { status: 'SKIPPED' } })).status, 404);
  });
  await t.test('authoritative comparator resolves deterministic ties', () => {
    const a = { _id: id(1), priorityLevel: 'NORMAL', queueNumber: 1, checkedInAt: checked };
    assert.ok(compareQueueEntries(a, { ...a, _id: id(2) }) < 0);
    assert.ok(compareQueueEntries(a, { ...a, checkedInAt: at }) < 0);
  });
  for (const priorities of [['NORMAL', 'NORMAL'], ['NORMAL', 'APPROVED_PRIORITY'], ['APPROVED_PRIORITY', 'EMERGENCY']])
    await t.test(`call ordering ${priorities.join('/')}, safe state and audit`, async () => {
      await reset(); const first = await fixture({ priorityLevel: priorities[0], queueNumber: 1 });
      const second = await fixture({ priorityLevel: priorities[1], queueNumber: 2 });
      const expected = [first, second].sort(compareQueueEntries)[0]; const response = await call();
      assert.equal(response.status, 200); assert.equal(response.body.data.queueEntryId, expected._id.toString());
      assert.equal(response.body.data.calledAt, at.toISOString()); assert.equal(response.body.data.updatedAt, at.toISOString());
      assert.equal(response.body.data.priorityLevel, expected.priorityLevel); assert.equal(response.body.data.queueNumber, expected.queueNumber);
      assert.deepEqual(Object.keys(response.body.data).sort(), ['queueEntryId', 'bookingId', 'sessionId', 'queueNumber', 'priorityLevel', 'status', 'checkedInAt', 'calledAt', 'completedAt', 'updatedAt'].sort());
      const stored = await db.collection('queueEntries').findOne({ _id: expected._id });
      assert.deepEqual(stored.createdAt, checked); assert.deepEqual(stored.checkedInAt, checked);
      assert.equal((await db.collection('bookings').findOne({ _id: expected.bookingId })).status, 'CONFIRMED');
      assert.equal((await db.collection('opdSessions').findOne({ _id: sessionId })).status, 'OPEN');
      const audit = await db.collection('auditLogs').findOne(); assert.equal(audit.action, 'QUEUE_PATIENT_CALLED');
      assert.equal(audit.metadata.previousStatus, 'WAITING'); assert.equal(audit.metadata.newStatus, 'CALLED');
      assert.deepEqual(audit.createdAt, at); assert.ok(!JSON.stringify(audit).includes('private'));
      assert.equal(await db.collection('auditLogs').countDocuments({}), 1);
    });
  for (const status of ['CALLED', 'IN_CONSULTATION']) await t.test(`${status} blocks another call`, async () => {
    await reset(); await fixture({ status }); await fixture(); const before = await snapshot();
    assert.equal((await call()).status, 409); assert.deepEqual(await snapshot(), before);
  });
  for (const status of ['OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'])
    await t.test(`session ${status} eligibility for both mutations`, async () => {
      for (const patch of [false, true]) {
        await reset(); const entry = await fixture(); await db.collection('opdSessions').updateOne({ _id: sessionId }, { $set: { status } });
        const response = await call(patch ? { entry: entry._id, body: { status: 'SKIPPED' } } : {});
        assert.equal(response.status, ['OPEN', 'CLOSED', 'RUNNING'].includes(status) ? 200 : 409);
      }
    });
  for (const sessionDate of [new Date('2026-10-05T00:00Z'), new Date('2026-10-07T00:00Z'), new Date('2026-10-06T05:00Z'), '2026-10-06'])
    await t.test(`date ${sessionDate} rejected`, async () => {
      await reset(); const entry = await fixture(); await db.collection('opdSessions').updateOne({ _id: sessionId }, { $set: { sessionDate } });
      assert.equal((await call()).status, 409); assert.equal((await call({ entry: entry._id, body: { status: 'SKIPPED' } })).status, 409);
    });
  await t.test('Colombo midnight boundary uses calendar date rather than UTC date', async () => {
    await reset(); await fixture({ checkedInAt: new Date('2026-10-05T18:00Z'), createdAt: new Date('2026-10-05T18:00Z'), updatedAt: new Date('2026-10-05T18:00Z') },
      { checkedInAt: new Date('2026-10-05T18:00Z') });
    clock = new Date('2026-10-05T18:29:59Z'); assert.equal((await call()).status, 409);
    clock = new Date('2026-10-05T18:30:00Z'); assert.equal((await call()).status, 200);
  });
  for (const from of statuses) for (const to of statuses)
    await t.test(`${from} -> ${to}`, async () => {
      await reset(); const entry = await fixture({ status: from }); const before = await snapshot();
      const response = await call({ entry: entry._id, body: { status: to } });
      const allowed = from === to || edges[from].includes(to);
      assert.equal(response.status, allowed ? 200 : 409);
      if (from === to || !allowed) { assert.deepEqual(await snapshot(), before); return; }
      const stored = await db.collection('queueEntries').findOne({ _id: entry._id });
      assert.deepEqual(stored.updatedAt, at); assert.deepEqual(stored.calledAt, entry.calledAt);
      assert.deepEqual(stored.checkedInAt, checked); assert.deepEqual(stored.createdAt, checked);
      assert.equal(stored.priorityLevel, entry.priorityLevel); assert.equal(stored.queueNumber, entry.queueNumber);
      assert.equal(stored.completedAt?.toISOString() ?? null, to === 'COMPLETED' ? at.toISOString() : null);
      assert.equal((await db.collection('bookings').findOne({ _id: entry.bookingId })).status,
        ['COMPLETED', 'SKIPPED'].includes(to) ? to : 'CONFIRMED');
      const audit = await db.collection('auditLogs').findOne(); assert.equal(audit.action, 'QUEUE_STATUS_UPDATED');
      assert.equal(audit.metadata.previousStatus, from); assert.equal(audit.metadata.newStatus, to);
      assert.equal(await db.collection('auditLogs').countDocuments({}), 1);
    });
  for (const status of ['COMPLETED', 'SKIPPED']) await t.test(`historical ${status} replay preserves all records`, async () => {
    await reset(); const entry = await fixture({ status }, {}, { status: 'SUSPENDED' });
    await db.collection('opdSessions').updateOne({ _id: sessionId }, { $set: { status: 'COMPLETED', sessionDate: new Date('2026-10-05T00:00Z') } });
    const before = await snapshot(); assert.equal((await call({ entry: entry._id, body: { status } })).status, 200);
    assert.deepEqual(await snapshot(), before);
  });
  for (const [fields, bookingFields, patientFields] of [
    [{ queueNumber: 0 }, {}, {}], [{ priorityLevel: 'BAD' }, {}, {}], [{ status: 'BAD' }, {}, {}],
    [{ bookingId: id(999) }, {}, {}], [{ patientId: id(999) }, {}, {}],
    [{ checkedInAt: at }, {}, {}], [{ createdAt: 'bad' }, {}, {}], [{ updatedAt: 'bad' }, {}, {}],
    [{ status: 'CALLED', calledAt: 'bad' }, {}, {}], [{ status: 'CALLED', calledAt: null }, {}, {}],
    [{}, { sessionId: otherSession }, {}], [{}, { status: 'CANCELLED' }, {}],
    [{}, { status: 'RESCHEDULED' }, {}], [{}, {}, { status: 'SUSPENDED' }],
    [{ status: 'COMPLETED' }, { status: 'CONFIRMED' }, {}],
  ]) await t.test(`integrity conflict ${JSON.stringify([fields, bookingFields, patientFields])}`, async () => {
    await reset(); const entry = await fixture(fields, bookingFields, patientFields); const before = await snapshot();
    assert.equal((await call()).status, 409);
    assert.equal((await call({ entry: entry._id, body: { status: entry.status === 'COMPLETED' ? 'COMPLETED' : 'SKIPPED' } })).status, 409);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('duplicate valid queue numbers produce QUEUE_CONFLICT', async () => {
    await reset(); await db.collection('queueEntries').dropIndex('sessionId_1_queueNumber_1');
    try {
      await fixture({ queueNumber: 1 }); await fixture({ queueNumber: 1 });
      assert.equal((await call()).body.error.code, 'QUEUE_CONFLICT');
    } finally { await db.collection('queueEntries').deleteMany({}); await ensureQueueIndexes(db); }
  });
  await t.test('duplicate valid booking references produce QUEUE_CONFLICT', async () => {
    await reset(); await db.collection('queueEntries').dropIndex('bookingId_1');
    try {
      const entry = await fixture(); await db.collection('queueEntries').insertOne({ ...entry, _id: id(serial++), queueNumber: entry.queueNumber + 1 });
      assert.equal((await call()).body.error.code, 'QUEUE_CONFLICT');
    } finally { await db.collection('queueEntries').deleteMany({}); await ensureQueueIndexes(db); }
  });
  await t.test('simultaneous call-next calls exactly one patient', async () => {
    await reset(); await fixture(); await fixture();
    const responses = await Promise.all([call(), call({ user: 12 })]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    assert.equal(await db.collection('queueEntries').countDocuments({ status: 'CALLED' }), 1);
    assert.equal(await db.collection('auditLogs').countDocuments({}), 1);
  });
  await t.test('concurrent same-target patches produce one transition and audit', async () => {
    await reset(); const entry = await fixture({ status: 'IN_CONSULTATION' });
    const results = await Promise.all([call({ entry: entry._id, body: { status: 'COMPLETED' } }), call({ user: 12, entry: entry._id, body: { status: 'COMPLETED' } })]);
    assert.ok(results.every(r => r.status === 200)); assert.equal(await db.collection('auditLogs').countDocuments({}), 1);
  });
  await t.test('conflicting terminal patches commit only one transition', async () => {
    await reset(); const entry = await fixture({ status: 'IN_CONSULTATION' });
    const results = await Promise.all(['COMPLETED', 'SKIPPED'].map(status => call({ entry: entry._id, body: { status } })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(await db.collection('auditLogs').countDocuments({}), 1);
  });
  await t.test('call-next racing with skip serializes on the session', async () => {
    await reset(); const first = await fixture({ queueNumber: 1 }); await fixture({ queueNumber: 2 });
    const results = await Promise.all([call(), call({ user: 12, entry: first._id, body: { status: 'SKIPPED' } })]);
    assert.ok(results.every(r => r.status === 200));
    assert.ok(await db.collection('queueEntries').countDocuments({ status: 'CALLED' }) <= 1);
    assert.equal((await db.collection('bookings').findOne({ _id: first.bookingId })).status, 'SKIPPED');
  });
  for (const patch of [false, true]) await t.test(`audit failure rolls back ${patch ? 'queue/booking' : 'call'} and guard writes`, async () => {
    await reset(); const entry = await fixture({ status: patch ? 'IN_CONSULTATION' : 'WAITING' });
    await db.collection('auditLogs').insertOne({ _id: id(9999), action: patch ? 'QUEUE_STATUS_UPDATED' : 'QUEUE_PATIENT_CALLED' });
    await db.collection('auditLogs').createIndex({ action: 1 }, { unique: true });
    const before = await snapshot();
    try {
      assert.equal((await call(patch ? { entry: entry._id, body: { status: 'COMPLETED' } } : {})).status, 500);
      assert.deepEqual(await snapshot(), before);
    } finally { await db.collection('auditLogs').dropIndex('action_1'); }
  });
  await t.test('M3-15 metrics observe call, consultation, completion and skip naturally', async () => {
    await reset(); const first = await fixture({ queueNumber: 1 }), second = await fixture({ queueNumber: 2 });
    const read = () => metrics.get(id(12), sessionId);
    const before = await read(); assert.equal(before.waitingCount, 2);
    await call(); let state = await read(); assert.equal(state.waitingCount, 1); assert.equal(state.servingCount, 1); assert.equal(state.nowServing, 'A-001');
    await call({ entry: first._id, body: { status: 'IN_CONSULTATION' } }); assert.equal((await read()).servingCount, 1);
    await call({ entry: first._id, body: { status: 'COMPLETED' } }); state = await read(); assert.equal(state.servingCount, 0); assert.equal(state.nowServing, null);
    await call({ entry: second._id, body: { status: 'SKIPPED' } }); state = await read();
    assert.equal(state.waitingCount, 0); assert.equal(state.patientsCheckedIn, 2);
    assert.equal((await call()).body.data, null);
  });
});

test('M3-16 standalone MongoDB fails safely', { timeout: 60000 }, async t => {
  const { db } = await testMongo(t, false), hospitalId = id(1);
  await db.collection('users').insertOne({ _id: id(11), role: 'DOCTOR', status: 'ACTIVE', hospitalId });
  await db.collection('hospitals').insertOne({ _id: hospitalId, isActive: true });
  await assert.rejects(createQueueMutationRepository(db).callNext(id(11), id(100)), error => error.status === 503);
});
