import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { SignJWT } from 'jose';
import { ObjectId } from 'mongodb';
import express from 'express';
import { readAuthConfig } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { staffSessionRoutes } from '../modules/sessions/k_sessionRoutes.js';
import { createStaffSessionRepository } from '../modules/sessions/k_sessionRepository.js';
import { parseCreateSessionBody, parseStaffSessionId, parseStaffSessionQuery } from '../modules/sessions/k_sessionValidation.js';
import { ensureSessionIndexes } from '../modules/hospitals/hospitalSessions.js';
import { startHttp, startMongo } from './testServer.js';

const id = (n) => new ObjectId(n.toString(16).padStart(24, '0'));
const authConfig = readAuthConfig({ JWT_SECRET: 'member3-session-test-secret-'.repeat(3) });
const createBody = () => ({
  serviceId: id(11).toString(), sessionDate: '2026-10-06',
  startTime: '08:30', endTime: '12:30', capacity: 50, doctorOrTeam: '  OPD team  ',
});

test('session creation accepts only the six validated input fields', () => {
  const input = parseCreateSessionBody(createBody());
  assert.equal(input.serviceId.toString(), id(11).toString());
  assert.equal(input.sessionDate.toISOString(), '2026-10-06T00:00:00.000Z');
  assert.equal(input.doctorOrTeam, 'OPD team');
  for (const field of Object.keys(createBody())) {
    const body = createBody();
    delete body[field];
    assert.throws(() => parseCreateSessionBody(body), (error) => error.status === 400);
  }
  for (const body of [null, [], 'invalid',
    { ...createBody(), serviceId: ['00000000000000000000000b'] },
    { ...createBody(), doctorOrTeam: ['team'] },
    { ...createBody(), sessionDate: ['2026-10-06'] },
    { ...createBody(), capacity: [50] },
  ]) assert.throws(() => parseCreateSessionBody(body), (error) => error.status === 400);
});

test('staff session filters validate calendar dates, IDs, statuses and bounded pagination', () => {
  assert.equal(parseStaffSessionQuery({}).view, 'today');
  assert.equal(parseStaffSessionQuery({ date: '2028-02-29' }).date, '2028-02-29');
  assert.equal(parseStaffSessionQuery({ serviceId: 'ABCDEF000000000000000001' }).serviceId.toString(),
    'abcdef000000000000000001');
  for (const query of [
    { date: '2026-02-29' }, { date: '2026-04-31' }, { date: '2026-2-01' },
    { date: '2026-10-02T00:00:00Z' }, { date: ['2026-10-02'] },
    { view: 'past' }, { view: ['today'] }, { view: 'today', date: '2026-10-02' },
    { serviceId: 'invalid' }, { serviceId: { $ne: null } },
    { status: 'open' }, { status: ['OPEN'] }, { hospitalId: id(2).toString() },
    { page: '0' }, { page: '1.5' }, { page: '10001' }, { page: ['1'] },
    { limit: '101' }, { limit: '-1' }, { limit: '01' }, { limit: '' },
  ]) assert.throws(() => parseStaffSessionQuery(query), (error) =>
    error.status === 400 && error.code === 'VALIDATION_ERROR' && Object.keys(error.fieldErrors).length > 0);
  assert.throws(() => parseStaffSessionId('invalid'), (error) => error.status === 400);
  assert.throws(() => parseStaffSessionId(id(1).toString(), { hospitalId: id(2).toString() }),
    (error) => error.status === 400);
});

test('staff session list/detail use verified identity and hospital scope with real MongoDB',
  { timeout: 60000 }, async (t) => {
    // The shared helper supplies a Unix-only mongod flag. Keep its isolated DB
    // lifecycle and adapt that flag locally on Windows without editing the helper.
    const originalSpawn = childProcess.spawn;
    const spawnMock = process.platform === 'win32'
      ? t.mock.method(childProcess, 'spawn', (command, args, options) =>
          originalSpawn(command, args.filter((arg) => arg !== '--nounixsocket'),
            { ...options, windowsHide: true }))
      : null;
    if (spawnMock) syncBuiltinESMExports();
    let db;
    try {
      ({ db } = await startMongo(t, { replicaSet: true }));
    } finally {
      if (spawnMock) {
        spawnMock.mock.restore();
        syncBuiltinESMExports();
      }
    }
    await ensureSessionIndexes(db);
    const hospitalId = id(1), otherHospitalId = id(2), serviceId = id(11);
    await db.collection('hospitals').insertMany([
      { _id: hospitalId, name: 'Hospital A', isActive: true },
      { _id: otherHospitalId, name: 'Hospital B', isActive: true },
    ]);
    await db.collection('opdServices').insertMany([
      { _id: serviceId, hospitalId, name: 'General OPD', isActive: true },
      { _id: id(12), hospitalId, name: 'Archived clinic', isActive: false },
      { _id: id(13), hospitalId: otherHospitalId, name: 'Other hospital service' },
    ]);
    const reception = id(21), patient = id(22);
    await db.collection('users').insertMany([
      { _id: reception, role: 'RECEPTION', status: 'ACTIVE', hospitalId },
      { _id: patient, role: 'PATIENT', status: 'ACTIVE', hospitalId },
      { _id: id(23), role: 'RECEPTION', status: 'ACTIVE' },
      { _id: id(24), role: 'RECEPTION', status: 'ACTIVE', hospitalId: hospitalId.toString() },
      { _id: id(25), role: 'RECEPTION', status: 'ACTIVE', hospitalId: id(999) },
      { _id: id(26), role: 'RECEPTION', status: 'SUSPENDED', hospitalId },
      { _id: id(27), role: 'NURSE', status: 'ACTIVE', hospitalId },
      { _id: id(28), role: 'ADMIN', status: 'ACTIVE', hospitalId },
      { _id: id(29), role: 'DOCTOR', status: 'ACTIVE', hospitalId },
      { _id: id(30), role: 'UNKNOWN_ROLE', status: 'ACTIVE', hospitalId },
    ]);
    const session = (n, fields = {}) => ({
      _id: id(n), hospitalId, serviceId, doctorOrTeam: 'OPD team',
      sessionDate: new Date('2026-10-02T00:00:00Z'), startTime: '08:30', endTime: '12:30',
      capacity: 50, bookedCount: 4, status: 'OPEN', createdById: reception,
      internalSecret: 'must not be exposed', createdAt: new Date(), ...fields,
    });
    await db.collection('opdSessions').insertMany([
      session(101), session(102, { startTime: '10:00', status: 'CLOSED' }),
      session(103, { serviceId: id(12), startTime: '11:00', status: 'COMPLETED' }),
      session(104, { sessionDate: new Date('2026-10-03T00:00:00Z'), status: 'CANCELLED' }),
      session(105, { sessionDate: new Date('2026-10-01T00:00:00Z') }),
      session(106, { hospitalId: otherHospitalId, serviceId: id(13) }),
      session(107, { sessionDate: new Date('2026-10-04T00:00:00Z'), serviceId: id(13) }),
      session(110, { sessionDate: new Date('2026-10-02T05:00:00Z') }),
      session(111, { sessionDate: new Date('2026-10-03T05:00:00Z') }),
      session(112, { sessionDate: '2026-10-03T00:00:00Z' }),
      session(113, { sessionDate: null }),
      session(114, { sessionDate: Date.parse('2026-10-03T00:00:00Z') }),
      session(115, { sessionDate: undefined }),
      session(116, { sessionDate: [new Date('2026-10-03T00:00:00Z')] }),
    ]);
    let now = new Date('2026-10-01T18:30:00Z'); // Calendar day is Oct 2 in Colombo.
    const repository = createStaffSessionRepository(db, { now: () => now });
    // Focus this fixture on the session router; unrelated profile/media routes
    // are exercised by the existing full-app suite.
    const app = express();
    app.set('query parser', 'simple');
    app.use(express.json({ limit: '100kb' }));
    app.use('/api/v1/staff/sessions', staffSessionRoutes(repository, authenticate(db, authConfig)));
    app.use(errorHandler);
    const base = await startHttp(t, app);
    async function token(userId, claims = {}) {
      return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId.toString()).setIssuer(authConfig.issuer).setAudience(authConfig.audience)
        .setIssuedAt().setExpirationTime('10m').sign(authConfig.key);
    }
    const staffToken = await token(reception);
    async function call(path = '', accessToken = staffToken) {
      const response = await fetch(`${base}/api/v1/staff/sessions${path}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      return { status: response.status, cache: response.headers.get('cache-control'),
        body: await response.json() };
    }
    async function create(body = createBody(), accessToken = staffToken, query = '') {
      const response = await fetch(`${base}/api/v1/staff/sessions${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify(body),
      });
      return { status: response.status, cache: response.headers.get('cache-control'),
        body: await response.json() };
    }
    async function edit(sessionId, body, accessToken = staffToken, query = '') {
      const response = await fetch(`${base}/api/v1/staff/sessions/${sessionId}${query}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify(body),
      });
      return { status: response.status, cache: response.headers.get('cache-control'),
        body: await response.json() };
    }

    await t.test('authentication and current account roles/status protect both endpoints', async () => {
      for (const path of ['', `/${id(101)}`]) {
        assert.equal((await call(path, null)).status, 401);
        assert.equal((await call(path, 'invalid-token')).status, 401);
        assert.equal((await call(path, await token(patient, { role: 'ADMIN', hospitalId }))).status, 403);
        assert.equal((await call(path, await token(id(26)))).status, 403);
        assert.equal((await call(path, await token(id(999)))).status, 401);
      }
    });
    for (const [role, staffId] of [['NURSE', id(27)], ['ADMIN', id(28)]]) {
      await t.test(`hospital-linked ${role} can list/read only their hospital sessions`, async () => {
        const accessToken = await token(staffId);
        const list = await call('', accessToken);
        assert.equal(list.status, 200);
        assert.deepEqual(list.body.data.map((s) => s._id), [101, 102, 103].map((n) => id(n).toString()));
        const detail = await call(`/${id(101)}`, accessToken);
        assert.equal(detail.status, 200);
        assert.deepEqual(detail.body.data, list.body.data[0]);
        const foreign = await call(`/${id(106)}`, accessToken);
        const missing = await call(`/${id(999)}`, accessToken);
        assert.equal(foreign.status, 404);
        assert.deepEqual(foreign.body, missing.body);
      });
    }
    await t.test('DOCTOR and unknown database roles cannot list or read sessions', async () => {
      for (const staffId of [id(29), id(30)]) {
        const accessToken = await token(staffId, { role: 'RECEPTION' });
        for (const path of ['', `/${id(101)}`]) {
          const result = await call(path, accessToken);
          assert.equal(result.status, 403);
          assert.equal(result.body.error.code, 'FORBIDDEN');
        }
      }
    });
    await t.test('today lists all statuses only in the linked hospital with a safe projection', async () => {
      const result = await call();
      assert.equal(result.status, 200);
      assert.equal(result.cache, 'no-store');
      assert.equal(result.body.success, true);
      assert.deepEqual(result.body.data.map((s) => s._id), [101, 102, 103].map((n) => id(n).toString()));
      assert.deepEqual(result.body.meta, {
        view: 'today', date: '2026-10-02', timeZone: 'Asia/Colombo', page: 1, limit: 50, hasMore: false,
      });
      assert.deepEqual(result.body.data[0], {
        _id: id(101).toString(), hospitalId: hospitalId.toString(), serviceId: serviceId.toString(),
        serviceName: 'General OPD', doctorOrTeam: 'OPD team', sessionDate: '2026-10-02',
        startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 4, status: 'OPEN',
      });
      assert.equal(result.body.data[2].serviceName, 'Archived clinic');
    });
    await t.test('upcoming, exact date, service/status and pagination filters are deterministic', async () => {
      const upcoming = await call('?view=upcoming');
      assert.deepEqual(upcoming.body.data.map((s) => s._id), [104, 107].map((n) => id(n).toString()));
      assert.equal(upcoming.body.data[1].serviceName, null); // Never join another hospital's catalog.
      assert.equal((await call('?date=2026-10-01')).body.data[0]._id, id(105).toString());
      assert.equal((await call('?date=2026-10-05')).body.data.length, 0);
      assert.equal((await call(`?serviceId=${serviceId}&status=CLOSED`)).body.data[0]._id, id(102).toString());
      assert.equal((await call(`?serviceId=${id(13)}`)).body.data.length, 0);
      const first = await call('?limit=2');
      assert.equal(first.body.meta.hasMore, true);
      const second = await call('?limit=2&page=2');
      assert.deepEqual(second.body.data.map((s) => s._id), [id(103).toString()]);
      assert.equal(second.body.meta.hasMore, false);
      now = new Date('2026-10-02T18:30:00Z');
      assert.equal((await call()).body.data[0]._id, id(104).toString());
      now = new Date('2026-10-01T18:30:00Z');
    });
    await t.test('malformed day markers are excluded before Upcoming pagination', async () => {
      const upcoming = await call('?view=upcoming');
      assert.equal(upcoming.status, 200);
      assert.deepEqual(upcoming.body.data.map((s) => s._id), [104, 107].map((n) => id(n).toString()));
      assert.deepEqual(upcoming.body.data.map((s) => s.sessionDate), ['2026-10-03', '2026-10-04']);
      const first = await call('?view=upcoming&limit=1');
      assert.equal(first.status, 200);
      assert.deepEqual(first.body.data.map((s) => s._id), [id(104).toString()]);
      assert.equal(first.body.meta.hasMore, true);
      const second = await call('?view=upcoming&limit=1&page=2');
      assert.equal(second.status, 200);
      assert.deepEqual(second.body.data.map((s) => s._id), [id(107).toString()]);
      assert.equal(second.body.meta.hasMore, false);
      const third = await call('?view=upcoming&limit=1&page=3');
      assert.equal(third.status, 200);
      assert.deepEqual(third.body.data, []);
      assert.equal(third.body.meta.hasMore, false);
      const exact = await call('?date=2026-10-03');
      assert.equal(exact.status, 200);
      assert.deepEqual(exact.body.data.map((s) => s._id), [id(104).toString()]);
    });
    await t.test('missing, string and dangling hospital links deny list and detail', async () => {
      for (const staffId of [id(23), id(24), id(25)]) {
        const accessToken = await token(staffId, { hospitalId: hospitalId.toString() });
        assert.equal((await call('', accessToken)).status, 403);
        assert.equal((await call(`/${id(101)}`, accessToken)).status, 403);
      }
    });
    await t.test('detail works and other-hospital/unknown session IDs have identical responses', async () => {
      const detail = await call(`/${id(101)}`);
      assert.equal(detail.status, 200);
      assert.equal(detail.cache, 'no-store');
      assert.deepEqual(detail.body.data, (await call()).body.data[0]);
      const foreign = await call(`/${id(106)}`), missing = await call(`/${id(999)}`);
      assert.equal(foreign.status, 404);
      assert.deepEqual(foreign.body, missing.body);
    });
    await t.test('invalid and repeated filters/IDs and client hospital scope are rejected', async () => {
      for (const path of [
        '/invalid', `/${id(101)}?hospitalId=${otherHospitalId}`, '?date=2026-02-29',
        '?view=other', '?view=today&view=upcoming', '?date=2026-10-02&date=2026-10-03',
        '?status=INVALID', '?limit=101', '?page=0', `?hospitalId=${otherHospitalId}`,
      ]) {
        const result = await call(path);
        assert.equal(result.status, 400, path);
        assert.equal(result.body.error.code, 'VALIDATION_ERROR');
      }
    });
    await t.test('membership changes are applied on the next request, not from JWT claims', async () => {
      await db.collection('users').updateOne({ _id: reception }, { $set: { hospitalId: otherHospitalId } });
      assert.deepEqual((await call()).body.data.map((s) => s._id), [id(106).toString()]);
      assert.equal((await call(`/${id(101)}`)).status, 404);
      await db.collection('users').updateOne({ _id: reception }, { $set: { hospitalId } });
    });
    await t.test('stored malformed calendar dates return a controlled error; missing services remain readable', async () => {
      await db.collection('opdSessions').insertMany([
        session(108, { sessionDate: new Date('2026-10-02T05:00:00Z') }),
        session(109, { serviceId: id(999), sessionDate: new Date('2026-10-05T00:00:00Z') }),
      ]);
      assert.equal((await call(`/${id(108)}`)).status, 409);
      const orphan = await call(`/${id(109)}`);
      assert.equal(orphan.status, 200);
      assert.equal(orphan.body.data.serviceName, null);
    });
    await t.test('reads do not mutate the session document', async () => {
      const before = await db.collection('opdSessions').findOne({ _id: id(101) });
      await call();
      await call(`/${id(101)}`);
      assert.deepEqual(await db.collection('opdSessions').findOne({ _id: id(101) }), before);
    });
    await t.test('create requires authenticated active staff with a valid hospital link', async () => {
      const before = await db.collection('opdSessions').countDocuments();
      assert.equal((await create(createBody(), null)).status, 401);
      assert.equal((await create(createBody(), 'invalid-token')).status, 401);
      for (const userId of [patient, id(23), id(24), id(25), id(26), id(29), id(30)]) {
        const result = await create(createBody(), await token(userId, { role: 'ADMIN' }));
        assert.equal(result.status, 403);
      }
      assert.equal(await db.collection('opdSessions').countDocuments(), before);
      assert.equal(await db.collection('auditLogs').countDocuments(), 0);
    });
    await t.test('creation rejects invalid fields, calendar dates, times and capacity without writes', async () => {
      const invalid = [null, [], {},
        ...['invalid', id(11).toString().slice(1), ['bad'], { $ne: null }]
          .map((serviceId) => ({ ...createBody(), serviceId })),
        ...['2026-02-29', '2026-04-31', '2026-10-6', '2026-10-06T00:00:00Z', ['2026-10-06']]
          .map((sessionDate) => ({ ...createBody(), sessionDate })),
        ...['8:30', '24:00', '12:60', '08:30:00', ['08:30'], null]
          .flatMap((time) => [
            { ...createBody(), startTime: time }, { ...createBody(), endTime: time },
          ]),
        { ...createBody(), endTime: '08:30' }, { ...createBody(), endTime: '08:00' },
        ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '50', null, [50]]
          .map((capacity) => ({ ...createBody(), capacity })),
        { ...createBody(), doctorOrTeam: '   ' }, { ...createBody(), doctorOrTeam: ['team'] },
      ];
      for (const field of Object.keys(createBody())) {
        const body = createBody(); delete body[field]; invalid.push(body);
      }
      const before = await db.collection('opdSessions').countDocuments();
      for (const body of invalid) {
        const result = await create(body);
        assert.equal(result.status, 400, JSON.stringify(body));
        assert.equal(result.body.error.code, 'VALIDATION_ERROR');
      }
      assert.equal((await create(createBody(), staffToken, '?date=2026-10-06')).status, 400);
      assert.equal(await db.collection('opdSessions').countDocuments(), before);
    });
    await t.test('creation rejects all client-controlled identity, counter, status and timestamp fields', async () => {
      for (const [field, value] of Object.entries({
        hospitalId: otherHospitalId.toString(), bookedCount: 10, status: 'CLOSED',
        createdById: patient.toString(), createdAt: '2020-01-01', updatedAt: '2020-01-01',
        _id: id(999).toString(), serviceName: 'Fake clinic', waitingCount: 100,
      })) {
        const result = await create({ ...createBody(), [field]: value });
        assert.equal(result.status, 400);
        assert.ok(result.body.error.fieldErrors[field]);
      }
    });
    await t.test('foreign, unknown, inactive and malformed services share a controlled error', async () => {
      await db.collection('opdServices').insertOne({ _id: id(14), hospitalId, isActive: true, name: '' });
      let expected;
      for (const serviceId of [id(13), id(999), id(12), id(14)]) {
        const result = await create({ ...createBody(), serviceId: serviceId.toString() });
        assert.equal(result.status, 400);
        assert.equal(result.body.error.code, 'VALIDATION_ERROR');
        expected ??= result.body;
        assert.deepEqual(result.body, expected);
      }
      await db.collection('hospitals').updateOne({ _id: hospitalId }, { $set: { isActive: false } });
      try { assert.equal((await create()).status, 403); }
      finally { await db.collection('hospitals').updateOne({ _id: hospitalId }, { $set: { isActive: true } }); }
    });
    await t.test('creation requires a future start interpreted in Asia/Colombo', async () => {
      for (const body of [
        { ...createBody(), sessionDate: '2026-10-01' },
        { ...createBody(), sessionDate: '2026-10-02', startTime: '00:00' },
      ]) assert.equal((await create(body)).status, 400);
      const result = await create({ ...createBody(), sessionDate: '2026-10-02', startTime: '00:01' });
      assert.equal(result.status, 201); // One minute after Colombo midnight.
    });
    for (const [role, userId] of [['RECEPTION', reception], ['NURSE', id(27)], ['ADMIN', id(28)]]) {
      await t.test(`${role} creates a server-owned OPEN session readable through M3-04 with one audit`, async () => {
        const result = await create(createBody(), await token(userId, { hospitalId: otherHospitalId.toString() }));
        assert.equal(result.status, 201);
        assert.equal(result.cache, 'no-store');
        assert.equal(result.body.success, true);
        const data = result.body.data;
        assert.deepEqual(data, {
          _id: data._id, hospitalId: hospitalId.toString(), serviceId: serviceId.toString(),
          serviceName: 'General OPD', doctorOrTeam: 'OPD team', sessionDate: '2026-10-06',
          startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 0, status: 'OPEN',
        });
        const stored = await db.collection('opdSessions').findOne({ _id: new ObjectId(data._id) });
        assert.ok(stored.hospitalId.equals(hospitalId));
        assert.ok(stored.createdById.equals(userId));
        assert.equal(stored.sessionDate.toISOString(), '2026-10-06T00:00:00.000Z');
        assert.ok(stored.createdAt instanceof Date);
        assert.deepEqual(stored.createdAt, now);
        assert.deepEqual(stored.updatedAt, stored.createdAt);
        assert.deepEqual((await call(`/${data._id}`)).body.data, data);
        assert.ok((await call('?date=2026-10-06')).body.data.some((s) => s._id === data._id));
        const logs = await db.collection('auditLogs').find({ entityId: data._id }).toArray();
        assert.equal(logs.length, 1);
        assert.equal(logs[0].action, 'SESSION_CREATED');
        assert.equal(logs[0].entityType, 'opdSession');
        assert.ok(logs[0].actorUserId.equals(userId));
        assert.ok(logs[0].metadata.hospitalId.equals(hospitalId));
        assert.deepEqual(logs[0].createdAt, stored.createdAt);
      });
    }
    await t.test('audit failure rolls back session creation and returns a safe project error', async () => {
      const before = await db.collection('opdSessions').countDocuments();
      const auditCount = await db.collection('auditLogs').countDocuments();
      const originalCollection = db.collection.bind(db);
      const mocked = t.mock.method(db, 'collection', (name, ...args) => name === 'auditLogs'
        ? { insertOne: async () => { throw new Error('private audit failure details'); } }
        : originalCollection(name, ...args));
      try {
        const result = await create();
        assert.equal(result.status, 500);
        assert.equal(result.body.error.code, 'INTERNAL_ERROR');
        assert.ok(!JSON.stringify(result.body).includes('private audit failure'));
      } finally { mocked.mock.restore(); }
      assert.equal(await db.collection('opdSessions').countDocuments(), before);
      assert.equal(await db.collection('auditLogs').countDocuments(), auditCount);
    });
    await t.test('a non-transaction-capable database rejects creation without partial writes', async () => {
      const before = await db.collection('opdSessions').countDocuments();
      const mocked = t.mock.method(db, 'admin', () => ({ command: async () => ({}) }));
      try {
        const result = await create();
        assert.equal(result.status, 503);
        assert.equal(result.body.error.code, 'SESSION_CREATION_UNAVAILABLE');
      } finally { mocked.mock.restore(); }
      assert.equal(await db.collection('opdSessions').countDocuments(), before);
    });
    await t.test('edit authentication, current roles and hospital linkage reject unauthorized writes', async () => {
      const before = await db.collection('opdSessions').findOne({ _id: id(101) });
      assert.equal((await edit(id(101), { capacity: 60 }, null)).status, 401);
      assert.equal((await edit(id(101), { capacity: 60 }, 'invalid-token')).status, 401);
      for (const userId of [patient, id(23), id(24), id(25), id(26), id(29), id(30)]) {
        assert.equal((await edit(id(101), { capacity: 60 },
          await token(userId, { role: 'ADMIN', hospitalId }))).status, 403);
      }
      assert.deepEqual(await db.collection('opdSessions').findOne({ _id: id(101) }), before);
    });
    await t.test('edit validates session IDs and conceals unknown/cross-hospital sessions', async () => {
      assert.equal((await edit('invalid', { capacity: 60 })).status, 400);
      const foreignBefore = await db.collection('opdSessions').findOne({ _id: id(106) });
      const foreign = await edit(id(106), { capacity: 60 });
      const missing = await edit(id(999), { capacity: 60 });
      assert.equal(foreign.status, 404);
      assert.deepEqual(foreign.body, missing.body);
      assert.deepEqual(await db.collection('opdSessions').findOne({ _id: id(106) }), foreignBefore);
    });
    await t.test('empty, protected, unknown and invalid edit fields are rejected without writes', async () => {
      const before = await db.collection('opdSessions').findOne({ _id: id(101) });
      const auditCount = await db.collection('auditLogs').countDocuments();
      const invalid = [null, [], {},
        ...['bad', { $ne: null }, [serviceId.toString()]].map((serviceId) => ({ serviceId })),
        ...['2026-02-29', '2026-04-31', '2026-10-6', '2026-10-06T00:00:00Z', null]
          .map((sessionDate) => ({ sessionDate })),
        ...['8:30', '24:00', '12:60', null, ['08:30']]
          .flatMap((time) => [{ startTime: time }, { endTime: time }]),
        { startTime: '13:00' }, { endTime: '08:30' },
        { startTime: '15:00', endTime: '14:00' },
        ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '50', null, [50]]
          .map((capacity) => ({ capacity })),
        { doctorOrTeam: '   ' }, { doctorOrTeam: ['team'] },
        ...Object.entries({ _id: id(999).toString(), hospitalId: otherHospitalId.toString(),
          bookedCount: 0, status: 'CLOSED', createdById: patient.toString(),
          createdAt: '2020-01-01', updatedAt: '2020-01-01', serviceName: 'fake',
          waitingCount: 1, $set: { capacity: 1 } }).map(([field, value]) => ({ [field]: value })),
      ];
      for (const body of invalid) {
        const result = await edit(id(101), body);
        assert.equal(result.status, 400, JSON.stringify(body));
        assert.equal(result.body.error.code, 'VALIDATION_ERROR');
      }
      assert.equal((await edit(id(101), { capacity: 60 }, staffToken, '?hospitalId=bad')).status, 400);
      assert.deepEqual(await db.collection('opdSessions').findOne({ _id: id(101) }), before);
      assert.equal(await db.collection('auditLogs').countDocuments(), auditCount);
    });
    await t.test('edit checks the final active same-hospital service and active hospital', async () => {
      let expected;
      for (const service of [id(12), id(13), id(14), id(999)]) {
        const result = await edit(id(101), { serviceId: service.toString() });
        assert.equal(result.status, 400);
        expected ??= result.body;
        assert.deepEqual(result.body, expected);
      }
      assert.equal((await edit(id(103), { doctorOrTeam: 'New team' })).status, 400);
      await db.collection('hospitals').updateOne({ _id: hospitalId }, { $set: { isActive: false } });
      try { assert.equal((await edit(id(101), { capacity: 60 })).status, 403); }
      finally { await db.collection('hospitals').updateOne({ _id: hospitalId }, { $set: { isActive: true } }); }
    });
    await t.test('edit prevents capacity below bookings and permits capacity equal to bookings', async () => {
      await db.collection('opdSessions').insertOne(session(201));
      assert.equal((await edit(id(201), { capacity: 3 })).status, 400);
      assert.equal((await edit(id(201), { capacity: 4 })).status, 200);
      const stored = await db.collection('opdSessions').findOne({ _id: id(201) });
      assert.equal(stored.capacity, 4);
      assert.equal(stored.bookedCount, 4);
      await db.collection('opdSessions').insertOne(session(202, { bookedCount: '4' }));
      assert.equal((await edit(id(202), { capacity: 60 })).status, 409);
      assert.equal((await edit(id(110), { capacity: 60 })).status, 409);
    });
    for (const [role, userId] of [['RECEPTION', reception], ['NURSE', id(27)], ['ADMIN', id(28)]]) {
      await t.test(`${role} edits a partial session, preserves server-owned fields and creates one audit`, async () => {
        const created = await create();
        assert.equal(created.status, 201);
        const sessionId = new ObjectId(created.body.data._id);
        const before = await db.collection('opdSessions').findOne({ _id: sessionId });
        now = new Date(now.getTime() + 1000);
        const result = await edit(sessionId, { doctorOrTeam: '  Updated team  ', endTime: '13:00' },
          await token(userId, { hospitalId: otherHospitalId.toString() }));
        assert.equal(result.status, 200);
        assert.equal(result.cache, 'no-store');
        assert.equal(result.body.success, true);
        assert.equal(result.body.data.doctorOrTeam, 'Updated team');
        assert.equal(result.body.data.endTime, '13:00');
        assert.deepEqual((await call(`/${sessionId}`)).body.data, result.body.data);
        assert.ok((await call('?date=2026-10-06')).body.data.some((s) =>
          s._id === sessionId.toString() && s.endTime === '13:00'));
        const after = await db.collection('opdSessions').findOne({ _id: sessionId });
        assert.deepEqual(after, { ...before, doctorOrTeam: 'Updated team', endTime: '13:00', updatedAt: now });
        assert.ok(after.updatedAt > before.updatedAt);
        const logs = await db.collection('auditLogs').find({ entityId: sessionId.toString(),
          action: 'SESSION_UPDATED' }).toArray();
        assert.equal(logs.length, 1);
        assert.equal(logs[0].entityType, 'opdSession');
        assert.ok(logs[0].actorUserId.equals(userId));
        assert.ok(logs[0].metadata.hospitalId.equals(hospitalId));
        assert.deepEqual(logs[0].metadata.fields.sort(), ['doctorOrTeam', 'endTime']);
        assert.deepEqual(logs[0].createdAt, after.updatedAt);
      });
    }
    await t.test('all six editable fields update with an active same-hospital service and UTC day', async () => {
      await db.collection('opdServices').insertOne({ _id: id(15), hospitalId, name: 'New clinic', isActive: true });
      const result = await edit(id(101), { ...createBody(), serviceId: id(15).toString(),
        sessionDate: '2026-10-07', startTime: '09:00', endTime: '14:00', capacity: 40 });
      assert.equal(result.status, 200);
      assert.equal(result.body.data.serviceName, 'New clinic');
      const stored = await db.collection('opdSessions').findOne({ _id: id(101) });
      assert.equal(stored.sessionDate.toISOString(), '2026-10-07T00:00:00.000Z');
      assert.equal(stored.startTime, '09:00');
      assert.equal(stored.capacity, 40);
      assert.equal(stored.bookedCount, 4);
    });
    await t.test('edit introduces no unsupported past/date/status restrictions or status changes', async () => {
      for (const [n, status] of [[210, 'OPEN'], [211, 'CLOSED'], [212, 'RUNNING'],
        [213, 'COMPLETED'], [214, 'CANCELLED']]) {
        await db.collection('opdSessions').insertOne(session(n, { status }));
        const result = await edit(id(n), { sessionDate: '2026-10-01', startTime: '00:01' });
        assert.equal(result.status, 200);
        assert.equal(result.body.data.status, status);
        assert.equal(result.body.data.sessionDate, '2026-10-01');
      }
    });
    await t.test('audit failure rolls back editing and never exposes internal errors', async () => {
      const before = await db.collection('opdSessions').findOne({ _id: id(101) });
      const auditCount = await db.collection('auditLogs').countDocuments();
      const originalCollection = db.collection.bind(db);
      const mocked = t.mock.method(db, 'collection', (name, ...args) => name === 'auditLogs'
        ? { insertOne: async () => { throw new Error('private audit failure details'); } }
        : originalCollection(name, ...args));
      try {
        const result = await edit(id(101), { capacity: 60 });
        assert.equal(result.status, 500);
        assert.equal(result.body.error.code, 'INTERNAL_ERROR');
        assert.ok(!JSON.stringify(result.body).includes('private audit failure'));
      } finally { mocked.mock.restore(); }
      assert.deepEqual(await db.collection('opdSessions').findOne({ _id: id(101) }), before);
      assert.equal(await db.collection('auditLogs').countDocuments(), auditCount);
    });
    await t.test('a standalone database rejects editing without partial writes', async () => {
      const before = await db.collection('opdSessions').findOne({ _id: id(101) });
      const mocked = t.mock.method(db, 'admin', () => ({ command: async () => ({}) }));
      try { assert.equal((await edit(id(101), { capacity: 60 })).status, 503); }
      finally { mocked.mock.restore(); }
      assert.deepEqual(await db.collection('opdSessions').findOne({ _id: id(101) }), before);
    });
    await t.test('a concurrent booking forces edit to retry and recheck capacity', async () => {
      await db.collection('opdSessions').insertOne(session(220, { capacity: 10, bookedCount: 4 }));
      const auditCount = await db.collection('auditLogs').countDocuments();
      const originalCollection = db.collection.bind(db);
      let bookingAdded = false;
      const mocked = t.mock.method(db, 'collection', (name, ...args) => {
        const collection = originalCollection(name, ...args);
        if (name === 'opdSessions') {
          const update = collection.updateOne.bind(collection);
          collection.updateOne = async (filter, changes, options) => {
            if (!bookingAdded && filter._id.equals(id(220)) && options?.session) {
              bookingAdded = true;
              await update({ _id: id(220) }, { $inc: { bookedCount: 1 } });
            }
            return update(filter, changes, options);
          };
        }
        return collection;
      });
      try {
        const result = await edit(id(220), { capacity: 4 });
        assert.equal(result.status, 400);
        assert.ok(result.body.error.fieldErrors.capacity);
      } finally { mocked.mock.restore(); }
      assert.equal(bookingAdded, true);
      const stored = await db.collection('opdSessions').findOne({ _id: id(220) });
      assert.equal(stored.bookedCount, 5);
      assert.equal(stored.capacity, 10);
      assert.equal(await db.collection('auditLogs').countDocuments(), auditCount);
    });
  });
