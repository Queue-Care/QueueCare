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
import { parseStaffSessionId, parseStaffSessionQuery } from '../modules/sessions/k_sessionValidation.js';
import { ensureSessionIndexes } from '../modules/hospitals/hospitalSessions.js';
import { startHttp, startMongo } from './testServer.js';

const id = (n) => new ObjectId(n.toString(16).padStart(24, '0'));
const authConfig = readAuthConfig({ JWT_SECRET: 'member3-session-test-secret-'.repeat(3) });

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
      ({ db } = await startMongo(t));
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
  });
