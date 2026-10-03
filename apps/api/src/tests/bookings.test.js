import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { createApp } from '../app.js';
import { authenticate } from '../middleware/auth.js';
import { readAuthConfig } from '../config/auth.js';
import {
  createBookingRepository,
  ensureBookingIndexes,
} from '../modules/bookings/bookingRepository.js';
import { parseBookingBody } from '../modules/bookings/bookingRoutes.js';
import { startHttp, startMongo } from './testServer.js';
const id = (n) => new ObjectId(n.toString(16).padStart(24, '0'));
const at = new Date('2026-10-03T02:00:00Z');
const config = readAuthConfig({
  JWT_SECRET: 'test-only-secret-never-used-in-production-12345678901234567890',
});
async function token(user = id(1), claims = {}, options = {}) {
  return new SignJWT({
    sub: user.toString(),
    iss: config.issuer,
    aud: config.audience,
    iat: at.getTime() / 1000,
    exp: at.getTime() / 1000 + 3600,
    ...claims,
  })
    .setProtectedHeader({ alg: options.alg ?? 'HS256' })
    .sign(options.key ?? config.key);
}
function app(db, client, options = {}) {
  return createApp({
    hospitalRepository: {},
    checkDatabase: async () => {},
    authenticate: authenticate(db, config, { now: () => at }),
    bookingRepository: createBookingRepository(db, client, {
      now: () => at,
      ...options,
    }),
  });
}
async function post(base, sessionId, bearer, extra = {}, suffix = '') {
  const response = await fetch(`${base}/api/v1/bookings${suffix}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ sessionId: sessionId.toString(), ...extra }),
  });
  return { status: response.status, body: await response.json() };
}
test('booking payload is strict and never accepts patient identity, codes, or counts', () => {
  assert.ok(
    parseBookingBody({ sessionId: id(10).toString().toUpperCase() }).equals(
      id(10)
    )
  );
  for (const body of [
    null,
    [],
    {},
    { sessionId: 'invalid' },
    { sessionId: { $ne: null } },
    { sessionId: id(10).toString(), patientId: id(2).toString() },
    { sessionId: id(10).toString(), bookingCode: 'made-up' },
    { sessionId: id(10).toString(), bookedCount: 0 },
  ]) {
    assert.throws(
      () => parseBookingBody(body),
      (error) => error.status === 400
    );
  }
  assert.throws(
    () => parseBookingBody({ sessionId: id(10).toString() }, { bypass: '1' }),
    (error) => error.status === 400
  );
  assert.equal(readAuthConfig({}), undefined);
  assert.throws(
    () => readAuthConfig({ JWT_SECRET: 'short' }),
    (error) => error.code === 'AUTH_CONFIG'
  );
});
test('JWT verifies signature, expiry, issuer, audience, algorithm and required claims before reading users', async (t) => {
  let reads = 0;
  const db = {
    collection: () => ({
      findOne: async () => {
        reads++;
        return { _id: id(1), role: 'PATIENT', status: 'ACTIVE' };
      },
    }),
  };
  const base = await startHttp(
    t,
    createApp({
      hospitalRepository: {},
      checkDatabase: async () => {},
      authenticate: authenticate(db, config, { now: () => at }),
      bookingRepository: {
        create: async (patientId) => ({ patientId: patientId.toString() }),
      },
    })
  );
  for (const bad of [
    undefined,
    'not-a-jwt',
    await token(id(1), { exp: at.getTime() / 1000 }),
    await token(id(1), { iss: 'other' }),
    await token(id(1), { aud: 'other' }),
    await token(id(1), { sub: 'invalid' }),
    await token(id(1), { exp: undefined }),
    await token(id(1), { iat: undefined }),
    await token(id(1), { nbf: at.getTime() / 1000 + 60 }),
    await token(
      id(1),
      {},
      {
        key: new TextEncoder().encode(
          'wrong-signing-key-with-at-least-32-bytes'
        ),
      }
    ),
    await token(id(1), {}, { alg: 'HS384' }),
  ]) {
    const response = await post(base, id(10), bad);
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  }
  assert.equal(reads, 0);
  const result = await post(
    base,
    id(10),
    await token(id(1), { role: 'ADMIN', patientId: id(2).toString() })
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.data.patientId, id(1).toString());
  assert.equal(reads, 1);
  const disabled = await startHttp(
    t,
    createApp({
      hospitalRepository: {},
      checkDatabase: async () => {},
      authenticate: authenticate(db, undefined),
    })
  );
  assert.equal((await post(disabled, id(10), await token())).status, 503);
});
test(
  'booking transactions over HTTP with a real isolated replica set',
  { timeout: 90000 },
  async (t) => {
    const { db, client } = await startMongo(t, { replicaSet: true });
    await ensureBookingIndexes(db);
    await ensureBookingIndexes(db);
    const users = db.collection('users'),
      sessions = db.collection('opdSessions'),
      bookings = db.collection('bookings');
    await users.insertMany(
      Array.from({ length: 16 }, (_, i) => ({
        _id: id(i + 1),
        role: 'PATIENT',
        status: 'ACTIVE',
      }))
    );
    const hospitalId = id(100),
      serviceId = id(200);
    await db
      .collection('hospitals')
      .insertOne({ _id: hospitalId, name: 'Test hospital', isActive: true });
    await db.collection('opdServices').insertOne({
      _id: serviceId,
      hospitalId,
      name: 'General OPD',
      isActive: true,
    });
    const sample = (n, changes = {}) => ({
      _id: id(n),
      hospitalId,
      serviceId,
      doctorOrTeam: 'Test team',
      sessionDate: new Date('2026-10-03T00:00:00Z'),
      startTime: '09:00',
      endTime: '10:00',
      capacity: 5,
      bookedCount: 0,
      status: 'OPEN',
      ...changes,
    });
    const base = await startHttp(t, app(db, client));
    const bearer = await token();
    await t.test(
      'creates persisted public booking and increments capacity exactly once; duplicates include cancelled records',
      async () => {
        await sessions.insertOne(sample(301));
        const result = await post(base, id(301), bearer);
        assert.equal(result.status, 201);
        assert.match(result.body.data.bookingCode, /^OPD-[A-F0-9]{32}$/);
        assert.deepEqual(
          Object.keys(result.body.data).sort(),
          [
            '_id',
            'bookingCode',
            'patientId',
            'sessionId',
            'status',
            'createdAt',
            'updatedAt',
          ].sort()
        );
        assert.equal(result.body.data.patientId, id(1).toString());
        assert.equal(result.body.data.status, 'CONFIRMED');
        assert.equal(
          (
            await bookings.findOne({ _id: new ObjectId(result.body.data._id) })
          ).sessionId.toString(),
          id(301).toString()
        );
        assert.equal((await sessions.findOne({ _id: id(301) })).bookedCount, 1);
        for (const status of ['CONFIRMED', 'CANCELLED']) {
          await bookings.updateOne(
            { patientId: id(1), sessionId: id(301) },
            { $set: { status } }
          );
          const duplicate = await post(base, id(301), bearer);
          assert.equal(duplicate.status, 409);
          assert.equal(duplicate.body.error.code, 'BOOKING_ALREADY_EXISTS');
          assert.equal(
            (await sessions.findOne({ _id: id(301) })).bookedCount,
            1
          );
        }
        const indexes = await bookings.indexes();
        assert.ok(
          indexes.find(
            (index) => index.name === 'booking_patient_session_unique'
          ).unique
        );
        assert.ok(
          indexes.find((index) => index.name === 'booking_code_unique').unique
        );
      }
    );
    await t.test(
      'concurrent patients competing for the final places cannot exceed capacity',
      async () => {
        await sessions.insertOne(sample(302, { capacity: 3 }));
        const tokens = await Promise.all(
          Array.from({ length: 12 }, (_, i) => token(id(i + 1)))
        );
        const results = await Promise.all(
          tokens.map((bearer) => post(base, id(302), bearer))
        );
        assert.equal(
          results.filter((result) => result.status === 201).length,
          3
        );
        assert.equal(
          results.filter((result) => result.body.error?.code === 'SESSION_FULL')
            .length,
          9
        );
        assert.equal(await bookings.countDocuments({ sessionId: id(302) }), 3);
        assert.equal((await sessions.findOne({ _id: id(302) })).bookedCount, 3);
      }
    );
    await t.test(
      'simultaneous duplicate requests create one booking and reserve one place',
      async () => {
        await sessions.insertOne(sample(303));
        const results = await Promise.all(
          Array.from({ length: 6 }, () => post(base, id(303), bearer))
        );
        assert.equal(
          results.filter((result) => result.status === 201).length,
          1
        );
        assert.equal(
          results.filter(
            (result) => result.body.error?.code === 'BOOKING_ALREADY_EXISTS'
          ).length,
          5
        );
        assert.equal((await sessions.findOne({ _id: id(303) })).bookedCount, 1);
      }
    );
    await t.test(
      'invalid body and impersonation cannot mutate data',
      async () => {
        const before = await bookings.countDocuments();
        assert.equal(
          (await post(base, id(301), bearer, { patientId: id(2).toString() }))
            .status,
          400
        );
        assert.equal(
          (await post(base, id(301), bearer, {}, '?force=true')).status,
          400
        );
        const response = await fetch(`${base}/api/v1/bookings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearer}`,
          },
          body: '{invalid',
        });
        assert.equal(response.status, 400);
        assert.equal(await bookings.countDocuments(), before);
      }
    );
    await t.test(
      'database role/status override JWT claims; deleted and suspended users are denied',
      async () => {
        for (const patch of [
          { role: 'NURSE', status: 'ACTIVE' },
          { role: 'RECEPTION' },
          { role: 'ADMIN' },
          { role: 'PATIENT', status: 'PENDING_VERIFICATION' },
          { status: 'PENDING_APPROVAL' },
          { status: 'SUSPENDED' },
        ]) {
          await users.updateOne({ _id: id(16) }, { $set: patch });
          assert.equal(
            (
              await post(
                base,
                id(301),
                await token(id(16), { role: 'PATIENT' })
              )
            ).status,
            403
          );
        }
        assert.equal(
          (await post(base, id(301), await token(id(999)))).status,
          401
        );
        // Also enforce account eligibility inside the transaction, independent of middleware's earlier read.
        await assert.rejects(
          createBookingRepository(db, client, { now: () => at }).create(
            id(16),
            id(301)
          ),
          (error) => error.status === 403
        );
      }
    );
    await t.test(
      'closed, started, malformed, inactive, missing and full sessions cannot reserve capacity',
      async () => {
        const changes = [
          { status: 'CLOSED' },
          { status: 'CANCELLED' },
          { status: 'RUNNING' },
          { status: 'COMPLETED' },
          { startTime: '07:30' },
          { sessionDate: new Date('2026-10-02T00:00:00Z') },
          { startTime: '25:00' },
          { endTime: '08:00' },
          { capacity: 2.5 },
          { bookedCount: -1 },
          { sessionDate: '2026-10-03' },
          { sessionDate: new Date('2026-10-03T01:00:00Z') },
          { hospitalId: id(999) },
          { serviceId: id(999) },
          { bookedCount: 5 },
          { bookedCount: 6 },
        ];
        for (const [i, change] of changes.entries()) {
          const item = sample(400 + i, change);
          await sessions.insertOne(item);
          const result = await post(base, item._id, bearer);
          assert.equal(result.status, 409, JSON.stringify(change));
          assert.equal(
            await bookings.countDocuments({ sessionId: item._id }),
            0
          );
          assert.deepEqual(
            (await sessions.findOne({ _id: item._id })).bookedCount,
            item.bookedCount
          );
        }
        assert.equal((await post(base, id(999), bearer)).status, 404);
        await sessions.insertOne(sample(450));
        for (const collection of ['hospitals', 'opdServices']) {
          const _id = collection === 'hospitals' ? hospitalId : serviceId;
          await db
            .collection(collection)
            .updateOne({ _id }, { $set: { isActive: false } });
          assert.equal(
            (await post(base, id(450), bearer)).body.error.code,
            'SESSION_UNAVAILABLE'
          );
          await db
            .collection(collection)
            .updateOne({ _id }, { $set: { isActive: true } });
        }
        await db
          .collection('opdServices')
          .updateOne({ _id: serviceId }, { $set: { hospitalId: id(999) } });
        assert.equal((await post(base, id(450), bearer)).status, 409);
        await db
          .collection('opdServices')
          .updateOne({ _id: serviceId }, { $set: { hospitalId } });
      }
    );
    await t.test(
      'concurrent hospital deactivation and session closure force revalidation on retry',
      async () => {
        for (const target of ['hospitals', 'opdSessions']) {
          const sessionId = target === 'hospitals' ? id(480) : id(481);
          await sessions.insertOne(
            sample(Number.parseInt(sessionId.toString(), 16))
          );
          let changed = false;
          const wrappedDb = {
            admin: () => db.admin(),
            collection(name) {
              const collection = db.collection(name);
              const method =
                target === 'hospitals' ? 'findOneAndUpdate' : 'updateOne';
              if (name !== target) return collection;
              return new Proxy(collection, {
                get(object, key) {
                  if (key === method)
                    return async (...args) => {
                      if (!changed) {
                        changed = true;
                        await db
                          .collection(target)
                          .updateOne(
                            {
                              _id:
                                target === 'hospitals' ? hospitalId : sessionId,
                            },
                            {
                              $set:
                                target === 'hospitals'
                                  ? { isActive: false }
                                  : { status: 'CLOSED' },
                            }
                          );
                      }
                      return object[method](...args);
                    };
                  const value = object[key];
                  return typeof value === 'function'
                    ? value.bind(object)
                    : value;
                },
              });
            },
          };
          await assert.rejects(
            createBookingRepository(wrappedDb, client, {
              now: () => at,
            }).create(id(1), sessionId),
            (error) => error.code === 'SESSION_UNAVAILABLE'
          );
          assert.equal(await bookings.countDocuments({ sessionId }), 0);
          assert.equal(
            (await sessions.findOne({ _id: sessionId })).bookedCount,
            0
          );
          await db
            .collection('hospitals')
            .updateOne({ _id: hospitalId }, { $set: { isActive: true } });
        }
      }
    );
    await t.test(
      'insert failure rolls back reserved capacity and eligibility revisions',
      async () => {
        await sessions.insertOne(sample(500));
        await bookings.insertOne({
          _id: id(900),
          patientId: id(15),
          sessionId: id(900),
          bookingCode: 'collision',
          status: 'CONFIRMED',
        });
        const beforePatient = await users.findOne({ _id: id(1) });
        const beforeHospital = await db
          .collection('hospitals')
          .findOne({ _id: hospitalId });
        const failedBase = await startHttp(
          t,
          app(db, client, { makeCode: () => 'collision' })
        );
        const result = await post(failedBase, id(500), bearer);
        assert.equal(result.status, 500);
        assert.equal(result.body.error.code, 'INTERNAL_ERROR');
        assert.ok(!JSON.stringify(result.body).includes('collision'));
        assert.equal((await sessions.findOne({ _id: id(500) })).bookedCount, 0);
        assert.equal(await bookings.countDocuments({ sessionId: id(500) }), 0);
        assert.deepEqual(await users.findOne({ _id: id(1) }), beforePatient);
        assert.deepEqual(
          await db.collection('hospitals').findOne({ _id: hospitalId }),
          beforeHospital
        );
      }
    );
  }
);
test(
  'standalone MongoDB returns safe 503 without partial writes',
  { timeout: 30000 },
  async (t) => {
    const { db, client } = await startMongo(t);
    await assert.rejects(
      createBookingRepository(db, client).create(id(1), id(2)),
      (error) => error.status === 503 && error.code === 'BOOKING_UNAVAILABLE'
    );
    assert.equal(await db.collection('bookings').countDocuments(), 0);
    assert.equal(await db.collection('opdSessions').countDocuments(), 0);
  }
);
