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
import { ensureBookingNotificationIndexes } from '../modules/bookings/bookingNotification.js';
import { startHttp, startMongo } from './testServer.js';

const id = (n) => new ObjectId(n.toString(16).padStart(24, '0'));
// Sessions below start at 09:00 Asia/Colombo (03:30Z), after this clock.
const at = new Date('2026-10-03T02:00:00Z');
const config = readAuthConfig({
  JWT_SECRET: 'test-only-cancel-secret-never-used-in-production-1234567890',
});
async function token(user) {
  return new SignJWT({
    sub: user.toString(),
    iss: config.issuer,
    aud: config.audience,
    iat: at.getTime() / 1000,
    exp: at.getTime() / 1000 + 3600,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(config.key);
}
async function request(base, path, bearer, method = 'GET') {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
  return { status: response.status, body: await response.json() };
}

test(
  'patient booking cancellation over HTTP with a real isolated replica set',
  { timeout: 60000 },
  async (t) => {
    const { db, client } = await startMongo(t, { replicaSet: true });
    await ensureBookingIndexes(db);
    await ensureBookingNotificationIndexes(db);
    const owner = id(1),
      other = id(2),
      staff = id(3),
      hospitalId = id(100),
      serviceId = id(200);
    await db.collection('users').insertMany([
      { _id: owner, role: 'PATIENT', status: 'ACTIVE' },
      { _id: other, role: 'PATIENT', status: 'ACTIVE' },
      { _id: staff, role: 'RECEPTION', status: 'ACTIVE', hospitalId },
    ]);
    await db.collection('hospitals').insertOne({
      _id: hospitalId,
      name: 'Test hospital',
      address: 'Test address',
      city: 'Colombo',
      isActive: true,
    });
    await db.collection('opdServices').insertOne({
      _id: serviceId,
      hospitalId,
      name: 'General OPD',
      isActive: true,
    });
    const sessions = db.collection('opdSessions'),
      bookings = db.collection('bookings'),
      audit = db.collection('auditLogs');
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
    const app = (now = () => at) =>
      createApp({
        hospitalRepository: {},
        checkDatabase: async () => {},
        authenticate: authenticate(db, config, { now: () => at }),
        bookingRepository: createBookingRepository(db, client, { now }),
      });
    const base = await startHttp(t, app());
    const ownerToken = await token(owner);
    async function book(sessionNumber) {
      await sessions.insertOne(sample(sessionNumber));
      const response = await fetch(`${base}/api/v1/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ sessionId: id(sessionNumber).toString() }),
      });
      assert.equal(response.status, 201);
      return (await response.json()).data._id;
    }

    await t.test(
      'owner cancels, capacity is released once and the action is audited',
      async () => {
        const bookingId = await book(301);
        assert.equal((await sessions.findOne({ _id: id(301) })).bookedCount, 1);
        const cancelled = await request(
          base,
          `/bookings/${bookingId}/cancel`,
          ownerToken,
          'PATCH'
        );
        assert.equal(cancelled.status, 200);
        assert.equal(cancelled.body.data.status, 'CANCELLED');
        assert.equal(cancelled.body.data._id, bookingId);
        assert.equal((await sessions.findOne({ _id: id(301) })).bookedCount, 0);
        const repeat = await request(
          base,
          `/bookings/${bookingId}/cancel`,
          ownerToken,
          'PATCH'
        );
        assert.equal(repeat.status, 200);
        assert.equal(repeat.body.data.status, 'CANCELLED');
        assert.equal((await sessions.findOne({ _id: id(301) })).bookedCount, 0);
        const entries = await audit
          .find({ action: 'BOOKING_CANCELLED', entityId: bookingId })
          .toArray();
        assert.equal(entries.length, 1);
        assert.ok(entries[0].actorUserId.equals(owner));
        const saved = await request(base, `/bookings/${bookingId}`, ownerToken);
        assert.equal(saved.body.data.status, 'CANCELLED');
      }
    );

    await t.test(
      'other patients, staff and malformed IDs cannot cancel',
      async () => {
        const bookingId = await book(302);
        const foreign = await request(
          base,
          `/bookings/${bookingId}/cancel`,
          await token(other),
          'PATCH'
        );
        assert.equal(foreign.status, 404);
        const staffAttempt = await request(
          base,
          `/bookings/${bookingId}/cancel`,
          await token(staff),
          'PATCH'
        );
        assert.equal(staffAttempt.status, 403);
        const anonymous = await request(
          base,
          `/bookings/${bookingId}/cancel`,
          undefined,
          'PATCH'
        );
        assert.equal(anonymous.status, 401);
        const malformed = await request(
          base,
          '/bookings/not-an-id/cancel',
          ownerToken,
          'PATCH'
        );
        assert.equal(malformed.status, 400);
        assert.equal(
          (await bookings.findOne({ _id: new ObjectId(bookingId) })).status,
          'CONFIRMED'
        );
        assert.equal((await sessions.findOne({ _id: id(302) })).bookedCount, 1);
      }
    );

    await t.test(
      'checked-in, completed and started bookings are not editable',
      async () => {
        const checkedIn = await book(303);
        await bookings.updateOne(
          { _id: new ObjectId(checkedIn) },
          { $set: { checkedInAt: at } }
        );
        const completed = await book(304);
        await bookings.updateOne(
          { _id: new ObjectId(completed) },
          { $set: { status: 'COMPLETED' } }
        );
        for (const bookingId of [checkedIn, completed]) {
          const result = await request(
            base,
            `/bookings/${bookingId}/cancel`,
            ownerToken,
            'PATCH'
          );
          assert.equal(result.status, 409);
          assert.equal(result.body.error.code, 'BOOKING_NOT_EDITABLE');
        }
        const started = await book(305);
        const lateBase = await startHttp(
          t,
          app(() => new Date('2026-10-03T03:30:00Z'))
        );
        const late = await request(
          lateBase,
          `/bookings/${started}/cancel`,
          ownerToken,
          'PATCH'
        );
        assert.equal(late.status, 409);
        assert.equal(late.body.error.code, 'BOOKING_NOT_EDITABLE');
        for (const n of [303, 304, 305])
          assert.equal((await sessions.findOne({ _id: id(n) })).bookedCount, 1);
        assert.equal(
          await audit.countDocuments({
            action: 'BOOKING_CANCELLED',
            entityId: { $in: [checkedIn, completed, started] },
          }),
          0
        );
      }
    );
  }
);
