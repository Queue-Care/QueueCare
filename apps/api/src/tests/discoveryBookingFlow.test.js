import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { createApp } from '../app.js';
import { authenticate } from '../middleware/auth.js';
import { readAuthConfig } from '../config/auth.js';
import {
  createHospitalRepository,
  ensureHospitalIndexes,
} from '../modules/hospitals/hospitalRepository.js';
import {
  createBookingRepository,
  ensureBookingIndexes,
} from '../modules/bookings/bookingRepository.js';
import { ensureBookingNotificationIndexes } from '../modules/bookings/bookingNotification.js';
import { startHttp, startMongo } from './testServer.js';

test(
  'real HTTP discovery -> final-place booking -> saved summary, capacity and notification',
  { timeout: 60000 },
  async (t) => {
    const { db, client } = await startMongo(t, { replicaSet: true });
    await ensureHospitalIndexes(db);
    await ensureBookingIndexes(db);
    await ensureBookingNotificationIndexes(db);
    const patientId = new ObjectId(),
      secondPatientId = new ObjectId();
    const hospitalId = new ObjectId(),
      serviceId = new ObjectId(),
      sessionId = new ObjectId();
    const at = new Date('2026-10-04T02:00:00.000Z');
    const auth = readAuthConfig({
      JWT_SECRET: 'test-only-discovery-flow-secret-never-used-by-the-app',
    });
    const bearer = (userId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId.toString())
        .setIssuer(auth.issuer)
        .setAudience(auth.audience)
        .setIssuedAt(at.getTime() / 1000)
        .setExpirationTime(at.getTime() / 1000 + 3600)
        .sign(auth.key);
    await db.collection('users').insertMany(
      [patientId, secondPatientId].map((_id) => ({
        _id,
        role: 'PATIENT',
        status: 'ACTIVE',
      }))
    );
    await db.collection('hospitals').insertOne({
      _id: hospitalId,
      name: 'Journey Test Hospital',
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
    await db.collection('opdSessions').insertOne({
      _id: sessionId,
      hospitalId,
      serviceId,
      doctorOrTeam: 'Test team',
      sessionDate: new Date('2026-10-04T00:00:00.000Z'),
      startTime: '09:00',
      endTime: '10:00',
      status: 'OPEN',
      capacity: 1,
      bookedCount: 0,
    });
    const base = await startHttp(
      t,
      createApp({
        hospitalRepository: createHospitalRepository(db, { now: () => at }),
        bookingRepository: createBookingRepository(db, client, {
          now: () => at,
        }),
        authenticate: authenticate(db, auth, { now: () => at }),
        checkDatabase: () => db.command({ ping: 1 }),
      })
    );
    async function request(path, token, body) {
      const response = await fetch(`${base}/api/v1${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    }
    // Follow returned IDs through every public endpoint, rather than supplying independent fixtures per route.
    const search = await request('/hospitals?search=Journey&city=Colombo');
    assert.equal(search.status, 200);
    assert.equal(search.body.data.length, 1);
    const hospitalPath = `/hospitals/${search.body.data[0]._id}`;
    const details = await request(hospitalPath);
    assert.equal(details.status, 200);
    assert.equal(details.body.data.name, 'Journey Test Hospital');
    const services = await request(`${hospitalPath}/services`);
    assert.equal(services.status, 200);
    assert.equal(services.body.data.length, 1);
    const availabilityPath = `${hospitalPath}/sessions?date=2026-10-04&serviceId=${services.body.data[0]._id}`;
    const availability = await request(availabilityPath);
    assert.equal(availability.status, 200);
    assert.equal(availability.body.data.length, 1);
    const selected = availability.body.data[0];
    assert.equal(selected.isBookable, true);
    assert.equal(selected.remainingCapacity, 1);
    assert.equal(await db.collection('bookings').countDocuments(), 0);
    assert.equal(await db.collection('notifications').countDocuments(), 0);

    const token = await bearer(patientId),
      otherToken = await bearer(secondPatientId);
    const created = await request('/bookings', token, {
      sessionId: selected._id,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.sessionId, selected._id);
    assert.equal(created.body.data.patientId, patientId.toString());
    const saved = await request(`/bookings/${created.body.data._id}`, token);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.bookingCode, created.body.data.bookingCode);
    assert.equal(saved.body.data.hospital._id, details.body.data._id);
    assert.equal(saved.body.data.service._id, services.body.data[0]._id);
    assert.equal(saved.body.data.session.startsAt, selected.startsAt);
    assert.equal(saved.body.data.session.endsAt, selected.endsAt);
    const after = await request(availabilityPath);
    assert.equal(after.status, 200);
    assert.equal(after.body.data[0].remainingCapacity, 0);
    assert.equal(after.body.data[0].isBookable, false);
    assert.equal(after.body.meta.bookableCount, 0);

    // Both callers still have the earlier bookable snapshot; the transaction must enforce current state.
    const duplicate = await request('/bookings', token, {
      sessionId: selected._id,
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'BOOKING_ALREADY_EXISTS');
    const full = await request('/bookings', otherToken, {
      sessionId: selected._id,
    });
    assert.equal(full.status, 409);
    assert.equal(full.body.error.code, 'SESSION_FULL');
    assert.equal(
      (await request(`/bookings/${created.body.data._id}`, otherToken)).status,
      404
    );
    assert.equal(await db.collection('bookings').countDocuments(), 1);
    assert.equal(
      (await db.collection('opdSessions').findOne({ _id: sessionId }))
        .bookedCount,
      1
    );
    const notices = await db.collection('notifications').find({}).toArray();
    assert.equal(notices.length, 1);
    assert.ok(notices[0].userId.equals(patientId));
    assert.equal(notices[0].data.bookingId.toString(), created.body.data._id);
    assert.equal(notices[0].data.event, 'BOOKING_CONFIRMED');
    assert.equal(notices[0].readAt, null);
  }
);
