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
import { createStaffDashboardRepository, staffDashboardRoutes } from '../modules/staff/g_staffDashboard.js';
import { createPriorityRepository } from '../modules/priority/g_priorityRepository.js';
import { staffPriorityRoutes } from '../modules/priority/g_priorityRoutes.js';
import { createPatientPriorityRepository } from '../modules/priority/patientPriorityRepository.js';
import { patientPriorityRoutes } from '../modules/priority/patientPriorityRoutes.js';
import { createNotificationRepository } from '../modules/notifications/g_notificationRepository.js';
import { startHttp, startMongo } from './testServer.js';

const id = n => new ObjectId(n.toString(16).padStart(24, '0'));
const authConfig = readAuthConfig({ JWT_SECRET: 'm3-dashboard-test-secret-'.repeat(3) });

test('M3-10 dashboard metrics use real MongoDB and authenticated hospital scope', { timeout: 60000 }, async t => {
  const originalSpawn = childProcess.spawn;
  const spawnMock = process.platform === 'win32' ? t.mock.method(childProcess, 'spawn',
    (command, args, options) => originalSpawn(command, args.filter(arg => arg !== '--nounixsocket'),
      { ...options, windowsHide: true })) : null;
  if (spawnMock) syncBuiltinESMExports();
  let db;
  try { ({ db } = await startMongo(t)); }
  finally { if (spawnMock) { spawnMock.mock.restore(); syncBuiltinESMExports(); } }
  const hospitalId = id(1), otherHospitalId = id(2), emptyHospitalId = id(3);
  await db.collection('hospitals').insertMany([
    { _id: hospitalId, isActive: true }, { _id: otherHospitalId, isActive: true },
    { _id: emptyHospitalId, isActive: true }, { _id: id(4), isActive: false },
  ]);
  const staff = (n, role, fields = {}) => ({ _id: id(n), role, status: 'ACTIVE', hospitalId,
    fullName: 'Reception Staff', hospital: 'Hospital A', staffId: `STAFF-${n}`, ...fields });
  await db.collection('users').insertMany([
    staff(21, 'RECEPTION'), staff(22, 'NURSE'), staff(23, 'ADMIN'), staff(24, 'PATIENT'),
    staff(25, 'DOCTOR'), staff(26, 'UNKNOWN'), staff(27, 'RECEPTION', { status: 'SUSPENDED' }),
    staff(28, 'RECEPTION', { hospitalId: null }), staff(29, 'RECEPTION', { hospitalId: hospitalId.toString() }),
    staff(30, 'RECEPTION', { hospitalId: id(999) }), staff(31, 'RECEPTION', { hospitalId: id(4) }),
    staff(32, 'RECEPTION', { hospitalId: emptyHospitalId }), staff(33, 'RECEPTION', { hospitalId: otherHospitalId }),
  ]);
  await db.collection('opdServices').insertMany([
    { _id: id(11), hospitalId, name: 'General OPD' },
    { _id: id(12), hospitalId: otherHospitalId, name: 'Private other hospital clinic' },
  ]);
  const day = new Date('2026-10-06T00:00:00Z');
  const session = (n, fields = {}) => ({ _id: id(n), hospitalId, serviceId: id(11), sessionDate: day,
    startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 4, status: 'OPEN',
    internalSecret: 'private', ...fields });
  await db.collection('opdSessions').insertMany([
    ...Array.from({ length: 25 }, (_, i) => session(101 + i, i === 0 ? { serviceId: id(12) } : {})),
    session(201, { hospitalId: otherHospitalId, serviceId: id(12) }),
    session(202, { sessionDate: new Date('2026-10-07T00:00:00Z') }),
    session(203, { sessionDate: new Date('2026-10-05T00:00:00Z') }),
    session(204, { sessionDate: new Date('2026-10-06T05:00:00Z') }),
    session(205, { sessionDate: [day] }),
  ]);
  await db.collection('bookings').insertMany([
    { _id: id(301), sessionId: id(101), checkedInAt: new Date(), status: 'CONFIRMED' },
    { _id: id(302), sessionId: id(125), checkedInAt: new Date(), status: 'CONFIRMED' },
    { _id: id(303), sessionId: id(201), checkedInAt: new Date(), status: 'CONFIRMED' },
    { _id: id(304), sessionId: id(202), checkedInAt: new Date(), status: 'CONFIRMED' },
    { _id: id(305), sessionId: id(102), checkedInAt: 'not a date' },
    { _id: id(306), sessionId: id(103) },
    { _id: id(307), sessionId: id(999), checkedInAt: new Date() },
  ]);
  await db.collection('queueEntries').insertMany([
    { _id: id(401), sessionId: id(101), queueNumber: 1, status: 'CALLED', calledAt: new Date('2026-10-06T01:00Z') },
    { _id: id(402), sessionId: id(125), queueNumber: 42, status: 'IN_CONSULTATION', calledAt: new Date('2026-10-06T02:00Z') },
    { _id: id(403), sessionId: id(201), queueNumber: 99, status: 'CALLED', calledAt: new Date('2026-10-06T03:00Z') },
    { _id: id(404), sessionId: id(202), queueNumber: 77, status: 'CALLED', calledAt: new Date('2026-10-06T04:00Z') },
    { _id: id(405), sessionId: id(101), queueNumber: 88, status: 'COMPLETED', calledAt: new Date('2026-10-06T05:00Z') },
  ]);
  await db.collection('priorityRequests').insertMany([
    { _id: id(501), bookingId: id(301), status: 'PENDING' },
    { _id: id(502), bookingId: id(302), status: 'ACCEPTED' },
    { _id: id(503), bookingId: id(303), status: 'PENDING' },
    { _id: id(504), bookingId: id(304), status: 'PENDING' },
    { _id: id(505), bookingId: id(999), status: 'PENDING' },
  ]);
  let now = new Date('2026-10-05T18:30:00Z');
  const repository = createStaffDashboardRepository(db, { now: () => now,
    priorityRepository: createPriorityRepository(db), notificationRepository: createNotificationRepository(db) });
  const app = express();
  app.use(express.json());
  app.set('query parser', 'simple');
  app.use('/api/v1', patientPriorityRoutes(createPatientPriorityRepository(db, { now: () => now }), authenticate(db, authConfig)));
  app.use('/api/v1/staff/priority-requests', staffPriorityRoutes(createPriorityRepository(db), authenticate(db, authConfig)));
  app.use('/api/v1/staff/dashboard', staffDashboardRoutes(repository, authenticate(db, authConfig)));
  app.use(errorHandler);
  const base = await startHttp(t, app);
  async function token(n, claims = {}) {
    return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject(id(n).toString())
      .setIssuer(authConfig.issuer).setAudience(authConfig.audience).setIssuedAt().setExpirationTime('10m').sign(authConfig.key);
  }
  const receptionToken = await token(21);
  async function call(accessToken = receptionToken, query = '') {
    const response = await fetch(`${base}/api/v1/staff/dashboard${query}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  }
  await t.test('unauthenticated, invalid JWT, patients and unauthorized/inactive roles are denied', async () => {
    assert.equal((await call(null)).status, 401);
    assert.equal((await call('invalid')).status, 401);
    for (const n of [24, 25, 26, 27]) assert.equal((await call(await token(n, { role: 'ADMIN' }))).status, 403);
  });
  await t.test('malformed, missing, dangling and inactive hospital links are denied', async () => {
    for (const n of [28, 29, 30, 31]) assert.equal((await call(await token(n, { hospitalId: hospitalId.toString() }))).status, 403);
    await db.collection('users').insertOne(staff(34, 'RECEPTION', { hospitalId: undefined }));
    assert.equal((await call(await token(34))).status, 403);
  });
  for (const [role, n] of [['RECEPTION', 21], ['NURSE', 22], ['ADMIN', 23]]) {
    await t.test(`${role} receives full-hospital KPIs independent of the 20-row list`, async () => {
      const result = await call(await token(n, { hospitalId: otherHospitalId.toString() }));
      assert.equal(result.status, 200);
      assert.equal(result.cache, 'no-store');
      assert.equal(result.body.success, true);
      const data = result.body.data;
      assert.deepEqual(Object.keys(data).sort(), ['date', 'nowServing', 'patientsCheckedIn', 'priorityWaiting',
        'sessions', 'sessionsToday', 'staff', 'unreadNotifications']);
      assert.equal(data.date, '2026-10-06');
      assert.equal(data.sessionsToday, 25);
      assert.equal(data.sessions.length, 20);
      assert.deepEqual(data.sessions.map(s => s._id), Array.from({ length: 20 }, (_, i) => id(101 + i).toString()));
      assert.equal(data.patientsCheckedIn, 2);
      assert.equal(data.nowServing, 'A-042');
      assert.equal(data.priorityWaiting, 2); // Pending requests remain hospital-wide, including future sessions.
      assert.equal(data.unreadNotifications, 0);
      assert.equal(data.staff.role, role);
      assert.equal(data.sessions[0].serviceName, 'OPD service');
      assert.equal(data.sessions[1].serviceName, 'General OPD');
      assert.equal(data.sessions[1].startsAt, '2026-10-06T03:00:00.000Z');
      assert.ok(!JSON.stringify(data).includes('private'));
      assert.ok(!JSON.stringify(data).includes('Private other hospital clinic'));
    });
  }
  await t.test('other hospital and zero-data hospital remain isolated', async () => {
    const other = (await call(await token(33))).body.data;
    assert.equal(other.sessionsToday, 1); assert.equal(other.patientsCheckedIn, 1);
    assert.equal(other.priorityWaiting, 1); assert.equal(other.nowServing, 'A-099');
    const empty = (await call(await token(32))).body.data;
    assert.equal(empty.sessionsToday, 0); assert.equal(empty.patientsCheckedIn, 0);
    assert.equal(empty.priorityWaiting, 0); assert.equal(empty.nowServing, null);
    assert.deepEqual(empty.sessions, []);
  });
  await t.test('unsupported query parameters cannot override hospital or date', async () => {
    for (const query of [`?hospitalId=${otherHospitalId}`, '?hospitalId[$ne]=null', '?date=2026-10-07',
      '?view=upcoming', '?limit=100', '?hospitalId=1&hospitalId=2']) {
      const result = await call(receptionToken, query);
      assert.equal(result.status, 400);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR');
      assert.ok(Object.keys(result.body.error.fieldErrors).length);
    }
  });
  await t.test('Colombo midnight selects the UTC-midnight calendar marker, not UTC current day', async () => {
    now = new Date('2026-10-05T18:29:59Z');
    let data = (await call()).body.data;
    assert.equal(data.date, '2026-10-05'); assert.equal(data.sessionsToday, 1);
    now = new Date('2026-10-05T18:30:00Z');
    data = (await call()).body.data;
    assert.equal(data.date, '2026-10-06'); assert.equal(data.sessionsToday, 25);
    now = new Date('2026-10-06T18:30:00Z');
    data = (await call()).body.data;
    assert.equal(data.date, '2026-10-07'); assert.equal(data.sessionsToday, 1);
    assert.equal(data.patientsCheckedIn, 1); assert.equal(data.nowServing, 'A-077');
  });
  await t.test('read-only metrics preserve existing session, booking and queue records', async () => {
    const collections = ['opdSessions', 'bookings', 'queueEntries'];
    const before = await Promise.all(collections.map(name => db.collection(name).find().sort({ _id: 1 }).toArray()));
    await call();
    const after = await Promise.all(collections.map(name => db.collection(name).find().sort({ _id: 1 }).toArray()));
    assert.deepEqual(after, before);
  });
  await t.test('patient submissions increase real hospital pending count and staff decisions decrease it without changing inbox semantics', async () => {
    await db.collection('users').insertOne({ _id: id(900), role: 'PATIENT', status: 'ACTIVE', fullName: 'Patient' });
    await db.collection('opdSessions').insertOne(session(800, { hospitalId: emptyHospitalId,
      sessionDate: new Date('2026-10-08T00:00:00Z') }));
    await db.collection('bookings').insertMany([801, 802, 803].map(n => ({
      _id: id(n), sessionId: id(800), patientId: id(900), status: 'CONFIRMED', bookingCode: `TEST-${n}`,
    })));
    const staffToken = await token(32), patientToken = await token(900);
    const headers = accessToken => ({ Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' });
    const pending = async () => {
      const response = await fetch(`${base}/api/v1/staff/priority-requests?status=pending`, { headers: headers(staffToken) });
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await call(staffToken)).body.data.priorityWaiting, 0);
    const ownRequests = [];
    for (const [index, booking] of [801, 802, 803].entries()) {
      const response = await fetch(`${base}/api/v1/bookings/${id(booking)}/priority-requests`, {
        method: 'POST', headers: headers(patientToken), body: JSON.stringify({ reason: 'MOBILITY' }),
      });
      assert.equal(response.status, 201);
      const { data } = await response.json();
      assert.equal(data.status, 'PENDING'); ownRequests.push(data._id);
      assert.equal((await call(staffToken)).body.data.priorityWaiting, index + 1);
      const inbox = await pending();
      assert.equal(inbox.meta.pendingCount, index + 1);
      assert.equal(inbox.data.length, index + 1);
    }
    assert.equal((await call(await token(33))).body.data.priorityWaiting, 1); // Other hospital is unchanged.
    for (const [index, decision] of ['ACCEPTED', 'DECLINED'].entries()) {
      const response = await fetch(`${base}/api/v1/staff/priority-requests/${ownRequests[index]}/decision`, {
        method: 'PATCH', headers: headers(staffToken), body: JSON.stringify({ decision }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.status, decision);
      assert.equal((await call(staffToken)).body.data.priorityWaiting, 2 - index);
      assert.equal((await pending()).meta.pendingCount, 2 - index);
    }
    assert.equal((await pending()).data[0]._id, ownRequests[2]);
    assert.equal(await db.collection('priorityRequests').countDocuments({ bookingId: { $in: [801, 802, 803].map(id) } }), 3);
  });
});
