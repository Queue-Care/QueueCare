import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { ObjectId } from 'mongodb';
import { startMongo } from './testServer.js';
import { ensureQueueIndexes } from '../config/indexes.js';
import { createStaffSessionRepository } from '../modules/sessions/k_sessionRepository.js';
import { parseCreateSessionBody, parseEditSessionBody } from '../modules/sessions/k_sessionValidation.js';
import { createBookingRepository, ensureBookingIndexes } from '../modules/bookings/bookingRepository.js';
import { ensureBookingNotificationIndexes } from '../modules/bookings/bookingNotification.js';
import { createCheckInRepository } from '../modules/bookings/k_checkInRepository.js';
import { createQueueRepository } from '../modules/queue/k_queueRepository.js';
import { createSessionMetricsRepository } from '../modules/queue/k_sessionMetricsRepository.js';
import { createQueueMutationRepository } from '../modules/queue/k_queueMutationRepository.js';

// Each scenario owns its temporary replica set and fixed clock. No app import
// or developer database is needed to exercise the real production writers.
async function fixture(t) {
  const spawn = childProcess.spawn;
  const mock = process.platform === 'win32' ? t.mock.method(childProcess, 'spawn',
    (command, args, options) => spawn(command, args.filter(arg => arg !== '--nounixsocket'),
      { ...options, windowsHide: true })) : null;
  if (mock) syncBuiltinESMExports();
  let db;
  try { ({ db } = await startMongo(t, { replicaSet: true })); }
  finally { if (mock) { mock.mock.restore(); syncBuiltinESMExports(); } }
  await ensureQueueIndexes(db);
  await ensureBookingIndexes(db);
  await ensureBookingNotificationIndexes(db);
  let clock = new Date('2026-10-06T02:00:00Z'); // 07:30 Colombo, before the session starts.
  const now = () => clock;
  const hospitalId = new ObjectId(), foreignHospital = new ObjectId();
  const serviceId = new ObjectId(), foreignService = new ObjectId();
  const reception = new ObjectId(), doctor = new ObjectId(), foreignReception = new ObjectId();
  await db.collection('hospitals').insertMany([
    { _id: hospitalId, isActive: true }, { _id: foreignHospital, isActive: true },
  ]);
  await db.collection('opdServices').insertMany([
    { _id: serviceId, hospitalId, name: 'General OPD', isActive: true },
    { _id: foreignService, hospitalId: foreignHospital, name: 'Foreign OPD', isActive: true },
  ]);
  await db.collection('users').insertMany([
    { _id: reception, hospitalId, role: 'RECEPTION', status: 'ACTIVE' },
    { _id: doctor, hospitalId, role: 'DOCTOR', status: 'ACTIVE' },
    { _id: foreignReception, hospitalId: foreignHospital, role: 'RECEPTION', status: 'ACTIVE' },
  ]);
  const sessions = createStaffSessionRepository(db, { now });
  const bookings = createBookingRepository(db, db.client, { now });
  const checkIn = createCheckInRepository(db, { now });
  const queue = createQueueRepository(db), metrics = createSessionMetricsRepository(db);
  const mutations = createQueueMutationRepository(db, { now });
  async function createSession(actor = reception, service = serviceId) {
    const result = await sessions.create(actor, parseCreateSessionBody({ serviceId: service.toString(),
      sessionDate: '2026-10-06', startTime: '09:00', endTime: '12:00', capacity: 5, doctorOrTeam: 'OPD team' }));
    return new ObjectId(result._id);
  }
  async function patient() {
    const patientId = new ObjectId();
    await db.collection('users').insertOne({ _id: patientId, role: 'PATIENT', status: 'ACTIVE', fullName: 'Demo Patient' });
    return patientId;
  }
  async function book(sessionId, patientId) {
    return new ObjectId((await bookings.create(patientId ?? await patient(), sessionId))._id);
  }
  const entryFor = bookingId => db.collection('queueEntries').findOne({ bookingId });
  const readMetrics = (sessionId, actor = reception) => metrics.get(actor, sessionId);
  const snapshot = (sessionId, actor = reception) => queue.getStaffSnapshot(actor, sessionId);
  const advance = () => { clock = new Date(clock.getTime() + 1000); };
  return { db, hospitalId, foreignHospital, serviceId, foreignService, reception, doctor, foreignReception,
    sessions, bookings, checkIn, mutations, createSession, patient, book, entryFor, readMetrics, snapshot, advance };
}

function preserved(before, after) {
  for (const field of ['_id', 'bookingId', 'sessionId', 'patientId', 'queueNumber', 'priorityLevel', 'checkedInAt', 'createdAt'])
    assert.deepEqual(after[field], before[field], `${field} must survive queue processing`);
}
function counts(metrics, waitingCount, servingCount, patientsCheckedIn, priorityCount = 0) {
  assert.deepEqual({ waitingCount: metrics.waitingCount, servingCount: metrics.servingCount,
    patientsCheckedIn: metrics.patientsCheckedIn, priorityCount: metrics.priorityCount },
  { waitingCount, servingCount, patientsCheckedIn, priorityCount });
}

test('M3-18 complete created-session lifecycle and terminal allocation history', { timeout: 60000 }, async t => {
  const f = await fixture(t), sessionId = await f.createSession(), patientId = await f.patient();
  const bookingId = await f.book(sessionId, patientId), secondBooking = await f.book(sessionId);
  const reserved = await f.db.collection('opdSessions').findOne({ _id: sessionId });
  assert.equal(reserved.bookedCount, 2);
  f.advance(); const checked = await f.checkIn.checkIn(f.reception, bookingId);
  const original = await f.entryFor(bookingId);
  assert.ok(original.queueNumber > 0);
  assert.ok(original.patientId.equals(patientId)); assert.ok(original.sessionId.equals(sessionId));
  assert.ok(original.bookingId.equals(bookingId)); assert.equal(original.priorityLevel, 'NORMAL');
  assert.equal(checked.checkedInAt, original.checkedInAt.toISOString());
  const afterCheckIn = await f.db.collection('opdSessions').findOne({ _id: sessionId });
  assert.equal(afterCheckIn.bookedCount, reserved.bookedCount); assert.equal(afterCheckIn.capacity, reserved.capacity);
  const waiting = (await f.snapshot(sessionId)).queue;
  assert.equal(waiting.length, 1); assert.equal(waiting[0].status, 'WAITING');
  assert.equal(waiting[0].queueNumber, original.queueNumber); assert.equal(waiting[0].position, 1);
  counts(await f.readMetrics(sessionId), 1, 0, 1);
  f.advance(); const called = await f.mutations.callNext(f.doctor, sessionId);
  assert.equal(called.queueEntryId, original._id.toString()); assert.equal(called.status, 'CALLED');
  preserved(original, await f.entryFor(bookingId));
  const serving = await f.readMetrics(sessionId); counts(serving, 0, 1, 1);
  assert.equal(serving.nowServing, `A-${String(original.queueNumber).padStart(3, '0')}`);
  assert.equal((await f.snapshot(sessionId)).queue[0].status, 'CALLED');
  f.advance(); await f.mutations.updateStatus(f.doctor, original._id, 'IN_CONSULTATION');
  counts(await f.readMetrics(sessionId), 0, 1, 1);
  assert.equal((await f.snapshot(sessionId)).queue[0].status, 'IN_CONSULTATION');
  f.advance(); await f.mutations.updateStatus(f.doctor, original._id, 'COMPLETED');
  const completed = await f.entryFor(bookingId); preserved(original, completed);
  assert.equal(completed.status, 'COMPLETED'); assert.equal(completed.calledAt.toISOString(), called.calledAt);
  assert.ok(completed.completedAt instanceof Date); assert.ok(completed.completedAt >= completed.calledAt);
  assert.equal((await f.db.collection('bookings').findOne({ _id: bookingId })).status, 'COMPLETED');
  counts(await f.readMetrics(sessionId), 0, 0, 1); assert.equal((await f.readMetrics(sessionId)).nowServing, null);
  assert.equal((await f.snapshot(sessionId)).queue.length, 0);
  f.advance(); const next = await f.checkIn.checkIn(f.reception, secondBooking);
  assert.equal(next.queueNumber, original.queueNumber + 1);
  assert.equal((await f.checkIn.checkIn(f.reception, secondBooking)).queueNumber, next.queueNumber);
  assert.equal(await f.db.collection('queueEntries').countDocuments({ sessionId }), 2);
  counts(await f.readMetrics(sessionId), 1, 0, 2);
  const finalSession = await f.db.collection('opdSessions').findOne({ _id: sessionId });
  assert.equal(finalSession.bookedCount, 2); assert.equal(finalSession.capacity, reserved.capacity);
});

test('M3-18 shared patient remains isolated across sessions and hospitals', { timeout: 60000 }, async t => {
  const f = await fixture(t), a = await f.createSession(), b = await f.createSession();
  const foreign = await f.createSession(f.foreignReception, f.foreignService), patient = await f.patient();
  const bookingA = await f.book(a, patient), bookingB = await f.book(b, patient), bookingForeign = await f.book(foreign, patient);
  await f.checkIn.checkIn(f.reception, bookingA); await f.checkIn.checkIn(f.reception, bookingB);
  await f.checkIn.checkIn(f.foreignReception, bookingForeign);
  const foreignEntry = await f.entryFor(bookingForeign);
  await f.db.collection('queueEntries').updateOne({ _id: foreignEntry._id }, { $set: { priorityLevel: 'EMERGENCY' } });
  const entryA = await f.entryFor(bookingA), entryB = await f.entryFor(bookingB);
  assert.equal(entryA.queueNumber, 1); assert.equal(entryB.queueNumber, 1); assert.equal(foreignEntry.queueNumber, 1);
  assert.ok(!entryA._id.equals(entryB._id));
  const beforeB = await f.entryFor(bookingB), beforeForeign = await f.entryFor(bookingForeign);
  const untouchedSessions = await f.db.collection('opdSessions').find({ _id: { $in: [b, foreign] } }).sort({ _id: 1 }).toArray();
  const metricsB = await f.readMetrics(b), metricsForeign = await f.readMetrics(foreign, f.foreignReception);
  counts(await f.readMetrics(a), 1, 0, 1); counts(metricsB, 1, 0, 1); counts(metricsForeign, 1, 0, 1, 1);
  assert.deepEqual((await f.snapshot(a)).queue.map(entry => entry.bookingId), [bookingA.toString()]);
  await assert.rejects(f.snapshot(foreign), error => error.status === 404);
  await assert.rejects(f.readMetrics(foreign), error => error.status === 404);
  await assert.rejects(f.mutations.callNext(f.doctor, foreign), error => error.status === 404);
  f.advance(); assert.equal((await f.mutations.callNext(f.doctor, a)).queueEntryId, entryA._id.toString());
  f.advance(); await f.mutations.updateStatus(f.doctor, entryA._id, 'SKIPPED');
  counts(await f.readMetrics(a), 0, 0, 1);
  assert.equal((await f.db.collection('bookings').findOne({ _id: bookingA })).status, 'SKIPPED');
  assert.deepEqual(await f.entryFor(bookingB), beforeB); assert.deepEqual(await f.entryFor(bookingForeign), beforeForeign);
  assert.deepEqual(await f.db.collection('opdSessions').find({ _id: { $in: [b, foreign] } }).sort({ _id: 1 }).toArray(), untouchedSessions);
  assert.deepEqual(await f.readMetrics(b), metricsB); assert.deepEqual(await f.readMetrics(foreign, f.foreignReception), metricsForeign);
  assert.equal((await f.db.collection('bookings').findOne({ _id: bookingB })).status, 'CONFIRMED');
  assert.equal((await f.db.collection('bookings').findOne({ _id: bookingForeign })).status, 'CONFIRMED');
});

test('M3-18 metadata editing and booking closure preserve a populated queue', { timeout: 60000 }, async t => {
  const f = await fixture(t), sessionId = await f.createSession(), bookingId = await f.book(sessionId);
  await f.checkIn.checkIn(f.reception, bookingId); const original = await f.entryFor(bookingId);
  const bookingBefore = await f.db.collection('bookings').findOne({ _id: bookingId });
  f.advance(); await f.sessions.edit(f.reception, sessionId, parseEditSessionBody({ doctorOrTeam: 'Updated OPD team', endTime: '12:30' }));
  assert.deepEqual(await f.entryFor(bookingId), original);
  assert.deepEqual(await f.db.collection('bookings').findOne({ _id: bookingId }), bookingBefore);
  assert.equal((await f.snapshot(sessionId)).queue[0].queueEntryId, original._id.toString());
  counts(await f.readMetrics(sessionId), 1, 0, 1);
  f.advance(); await f.sessions.closeBookings(f.reception, sessionId);
  await assert.rejects(f.book(sessionId), error => error.status === 409 && error.code === 'SESSION_UNAVAILABLE');
  assert.deepEqual(await f.entryFor(bookingId), original);
  assert.deepEqual(await f.db.collection('bookings').findOne({ _id: bookingId }), bookingBefore);
  f.advance(); await f.mutations.callNext(f.doctor, sessionId);
  f.advance(); await f.mutations.updateStatus(f.doctor, original._id, 'IN_CONSULTATION');
  f.advance(); await f.mutations.updateStatus(f.doctor, original._id, 'COMPLETED');
  assert.equal((await f.entryFor(bookingId)).status, 'COMPLETED');
  assert.equal((await f.db.collection('bookings').findOne({ _id: bookingId })).status, 'COMPLETED');
  const stored = await f.db.collection('opdSessions').findOne({ _id: sessionId });
  assert.equal(stored.status, 'CLOSED'); assert.equal(stored.doctorOrTeam, 'Updated OPD team');
  assert.equal(stored.bookedCount, 1); assert.equal(stored.capacity, 5);
  preserved(original, await f.entryFor(bookingId)); counts(await f.readMetrics(sessionId), 0, 0, 1);
  assert.equal((await f.snapshot(sessionId)).queue.length, 0);
});

test('M3-18 persisted priority aligns ordering, metrics and next selection', { timeout: 60000 }, async t => {
  const f = await fixture(t), sessionId = await f.createSession(), entries = [];
  for (let i = 0; i < 3; i++) {
    const booking = await f.book(sessionId); await f.checkIn.checkIn(f.reception, booking); entries.push(await f.entryFor(booking));
  }
  counts(await f.readMetrics(sessionId), 3, 0, 3);
  assert.deepEqual((await f.snapshot(sessionId)).queue.map(entry => entry.queueNumber), [1, 2, 3]);
  // Sequential persisted fixtures only: emergency assignment and concurrent
  // teammate priority acceptance/serialization are outside M3-18's scope.
  await f.db.collection('queueEntries').updateOne({ _id: entries[1]._id }, { $set: { priorityLevel: 'APPROVED_PRIORITY' } });
  await f.db.collection('queueEntries').updateOne({ _id: entries[2]._id }, { $set: { priorityLevel: 'EMERGENCY' } });
  const ordered = (await f.snapshot(sessionId)).queue;
  assert.deepEqual(ordered.map(entry => entry.queueNumber), [3, 2, 1]); counts(await f.readMetrics(sessionId), 3, 0, 3, 2);
  const before = await f.db.collection('queueEntries').find({ sessionId }).sort({ queueNumber: 1 }).toArray();
  assert.deepEqual(before.map(entry => entry.queueNumber), entries.map(entry => entry.queueNumber));
  f.advance(); const called = await f.mutations.callNext(f.doctor, sessionId);
  assert.equal(called.queueEntryId, ordered[0].queueEntryId); assert.equal(called.priorityLevel, 'EMERGENCY');
  const after = await f.db.collection('queueEntries').find({ sessionId }).sort({ queueNumber: 1 }).toArray();
  after.forEach((entry, index) => preserved(before[index], entry));
  const metrics = await f.readMetrics(sessionId); counts(metrics, 2, 1, 3, 1); assert.equal(metrics.nowServing, 'A-003');
  assert.deepEqual((await f.snapshot(sessionId)).queue.filter(entry => entry.status === 'WAITING').map(entry => entry.queueNumber), [2, 1]);
});
