import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { createApp } from '../app.js';
import { authenticate } from '../middleware/auth.js';
import { readAuthConfig } from '../config/auth.js';
import { createBookingRepository } from '../modules/bookings/bookingRepository.js';
import { startHttp, startMongo } from './testServer.js';

const id = (n) => new ObjectId(n.toString(16).padStart(24, '0'));
const at = new Date('2026-10-03T02:00:00Z');
const config = readAuthConfig({
  JWT_SECRET: 'isolated-test-only-signing-secret-at-least-32-bytes',
});
const token = (user) =>
  new SignJWT({ role: 'PATIENT' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.toString())
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt(at.getTime() / 1000)
    .setExpirationTime(at.getTime() / 1000 + 3600)
    .sign(config.key);

test(
  'patient booking summaries over HTTP with isolated MongoDB',
  { timeout: 60000 },
  async (t) => {
    const { db, client } = await startMongo(t);
    await db.collection('users').insertMany([
      { _id: id(1), role: 'PATIENT', status: 'ACTIVE', nic: 'private-nic' },
      { _id: id(2), role: 'PATIENT', status: 'ACTIVE' },
      { _id: id(3), role: 'NURSE', status: 'ACTIVE' },
      { _id: id(4), role: 'PATIENT', status: 'SUSPENDED' },
    ]);
    const hospital = {
      _id: id(100),
      name: 'Test Hospital',
      address: 'Test address',
      city: 'Colombo',
      isActive: true,
    };
    const service = {
      _id: id(200),
      hospitalId: id(100),
      name: 'General OPD',
      isActive: true,
    };
    const slot = {
      _id: id(300),
      hospitalId: id(100),
      serviceId: id(200),
      doctorOrTeam: 'Test team',
      sessionDate: new Date('2026-10-03T00:00:00Z'),
      startTime: '09:00',
      endTime: '10:00',
      status: 'OPEN',
      capacity: 20,
      bookedCount: 1,
    };
    const booking = {
      _id: id(400),
      patientId: id(1),
      sessionId: id(300),
      bookingCode: 'OPD-TEST-SAVED',
      status: 'CONFIRMED',
      createdAt: at,
      updatedAt: at,
    };
    const records = [
      ['hospitals', hospital],
      ['opdServices', service],
      ['opdSessions', slot],
      ['bookings', booking],
    ];
    for (const [collection, item] of records)
      await db
        .collection(collection)
        .insertOne({ ...item, internalNotes: 'private-note' });
    const base = await startHttp(
      t,
      createApp({
        hospitalRepository: {},
        checkDatabase: async () => {},
        authenticate: authenticate(db, config, { now: () => at }),
        bookingRepository: createBookingRepository(db, client),
      })
    );
    const bearer = await token(id(1));
    async function get(reference = id(400).toString(), credential = bearer) {
      const response = await fetch(`${base}/api/v1/bookings/${reference}`, {
        headers: credential ? { Authorization: `Bearer ${credential}` } : {},
      });
      return {
        status: response.status,
        cache: response.headers.get('cache-control'),
        body: await response.json(),
      };
    }
    await t.test(
      'returns only owned public fields and Sri Lanka instants without changing capacity',
      async () => {
        const result = await get(id(400).toString().toUpperCase());
        assert.equal(result.status, 200);
        assert.equal(result.cache, 'no-store');
        assert.deepEqual(result.body, {
          success: true,
          data: {
            ...booking,
            _id: id(400).toString(),
            patientId: id(1).toString(),
            sessionId: id(300).toString(),
            createdAt: at.toISOString(),
            updatedAt: at.toISOString(),
            hospital: { ...hospital, _id: id(100).toString() },
            service: {
              _id: id(200).toString(),
              name: service.name,
              isActive: true,
            },
            session: {
              _id: id(300).toString(),
              hospitalId: id(100).toString(),
              serviceId: id(200).toString(),
              doctorOrTeam: 'Test team',
              status: 'OPEN',
              sessionDate: '2026-10-03',
              startTime: '09:00',
              endTime: '10:00',
              startsAt: '2026-10-03T03:30:00.000Z',
              endsAt: '2026-10-03T04:30:00.000Z',
            },
          },
        });
        assert.equal(await db.collection('bookings').countDocuments(), 1);
        assert.equal(
          (await db.collection('opdSessions').findOne({ _id: id(300) }))
            .bookedCount,
          1
        );
      }
    );
    await t.test(
      'another patient cannot distinguish an existing booking from a missing booking',
      async () => {
        const foreign = await get(id(400).toString(), await token(id(2)));
        assert.equal(foreign.status, 404);
        assert.deepEqual(foreign, await get(id(999).toString()));
      }
    );
    await t.test(
      'missing/invalid credentials, deleted users and database role/status are enforced',
      async () => {
        for (const credential of ['', 'invalid.jwt', await token(id(999))])
          assert.equal((await get(undefined, credential)).status, 401);
        for (const user of [id(3), id(4)])
          assert.equal((await get(undefined, await token(user))).status, 403);
      }
    );
    await t.test(
      'invalid IDs and extra/repeated query parameters are rejected',
      async () => {
        for (const reference of [
          'not-an-id',
          `${id(400)}?patientId=${id(2)}`,
          `${id(400)}?include=private&include=all`,
        ]) {
          const result = await get(reference);
          assert.equal(result.status, 400);
          assert.equal(result.body.error.code, 'VALIDATION_ERROR');
        }
      }
    );
    await t.test(
      'inactive parents and all saved booking/session states remain readable',
      async () => {
        await db
          .collection('hospitals')
          .updateOne({ _id: id(100) }, { $set: { isActive: false } });
        await db
          .collection('opdServices')
          .updateOne({ _id: id(200) }, { $set: { isActive: false } });
        for (const status of [
          'CONFIRMED',
          'CANCELLED',
          'COMPLETED',
          'SKIPPED',
          'RESCHEDULED',
        ]) {
          await db
            .collection('bookings')
            .updateOne({ _id: id(400) }, { $set: { status } });
          const result = await get();
          assert.equal(result.status, 200);
          assert.equal(result.body.data.status, status);
          assert.equal(result.body.data.hospital.isActive, false);
          assert.equal(result.body.data.service.isActive, false);
        }
        for (const status of [
          'OPEN',
          'CLOSED',
          'RUNNING',
          'COMPLETED',
          'CANCELLED',
        ]) {
          await db
            .collection('opdSessions')
            .updateOne({ _id: id(300) }, { $set: { status } });
          const result = await get();
          assert.equal(result.status, 200);
          assert.equal(result.body.data.session.status, status);
        }
        for (const [collection, item] of records)
          await db.collection(collection).replaceOne({ _id: item._id }, item);
      }
    );
    await t.test(
      'missing relations and malformed records return safe incomplete-summary errors',
      async () => {
        const cases = [
          ['bookings', booking, { sessionId: id(999) }],
          ['bookings', booking, { bookingCode: '' }],
          ['bookings', booking, { status: 'UNKNOWN' }],
          ['bookings', booking, { updatedAt: new Date('2026-10-02') }],
          ['opdSessions', slot, { hospitalId: id(999) }],
          ['opdSessions', slot, { serviceId: id(999) }],
          ['opdSessions', slot, { sessionDate: '2026-10-03' }],
          [
            'opdSessions',
            slot,
            { sessionDate: new Date('2026-10-03T01:00:00Z') },
          ],
          ['opdSessions', slot, { startTime: '25:00' }],
          ['opdSessions', slot, { endTime: '08:00' }],
          ['opdSessions', slot, { status: 'UNKNOWN' }],
          ['opdServices', service, { hospitalId: id(999) }],
          ['hospitals', hospital, { address: '' }],
        ];
        for (const [collection, item, change] of cases) {
          await db
            .collection(collection)
            .replaceOne({ _id: item._id }, { ...item, ...change });
          const result = await get();
          assert.equal(result.status, 409, JSON.stringify(change));
          assert.equal(result.body.error.code, 'BOOKING_DETAILS_UNAVAILABLE');
          assert.equal(JSON.stringify(result.body).includes('private'), false);
          await db.collection(collection).replaceOne({ _id: item._id }, item);
        }
      }
    );
  }
);
