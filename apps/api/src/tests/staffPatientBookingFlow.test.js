import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { createApp } from '../app.js';
import { authenticate } from '../middleware/auth.js';
import { readAuthConfig } from '../config/auth.js';
import { ensureQueueIndexes } from '../config/indexes.js';
import {
  createHospitalRepository,
  ensureHospitalIndexes,
} from '../modules/hospitals/hospitalRepository.js';
import {
  createBookingRepository,
  ensureBookingIndexes,
} from '../modules/bookings/bookingRepository.js';
import { ensureBookingNotificationIndexes } from '../modules/bookings/bookingNotification.js';
import {
  createPatientRegistrationRepository,
  ensurePatientRegistrationIndexes,
} from '../modules/auth/patientRegistration.js';
import {
  createStaffAuthRepository,
  ensureStaffAuthIndexes,
} from '../modules/staff/g_staffAuthRepository.js';
import { createStaffSessionRepository } from '../modules/sessions/k_sessionRepository.js';
import { createCheckInRepository } from '../modules/bookings/k_checkInRepository.js';
import { createSessionMetricsRepository } from '../modules/queue/k_sessionMetricsRepository.js';
import {
  createNotificationRepository,
  ensureNotificationIndexes,
} from '../modules/notifications/g_notificationRepository.js';
import { startHttp, startMongo } from './testServer.js';

test(
  'real HTTP staff-created session -> patient discovery/booking -> staff edits/closure/check-in',
  { timeout: 60000 },
  async (t) => {
    const { db, client } = await startMongo(t, { replicaSet: true });
    for (const ensure of [
      ensurePatientRegistrationIndexes,
      ensureStaffAuthIndexes,
      ensureHospitalIndexes,
      ensureBookingIndexes,
      ensureBookingNotificationIndexes,
      ensureNotificationIndexes,
      ensureQueueIndexes,
    ])
      await ensure(db);
    // Domain clocks are fixed; login/JWT clocks use actual time so real tokens verify.
    const now = () => new Date('2026-10-07T02:00:00Z');
    const authConfig = readAuthConfig({
      JWT_SECRET: 'test-only-staff-patient-journey-secret-not-for-runtime',
    });
    const hospitals = [new ObjectId(), new ObjectId()];
    const serviceId = new ObjectId();
    await db.collection('hospitals').insertMany(
      hospitals.map((_id, i) => ({
        _id,
        name: `Journey Hospital ${i}`,
        address: 'Fictional test address',
        city: 'Colombo',
        isActive: true,
      }))
    );
    await db
      .collection('opdServices')
      .insertOne({
        _id: serviceId,
        hospitalId: hospitals[0],
        name: 'General OPD',
        isActive: true,
      });
    const base = await startHttp(
      t,
      createApp({
        authConfig,
        authenticate: authenticate(db, authConfig),
        checkDatabase: () => db.command({ ping: 1 }),
        patientRegistrationRepository: createPatientRegistrationRepository(db),
        staffAuthRepository: createStaffAuthRepository(db, authConfig),
        hospitalRepository: createHospitalRepository(db, { now }),
        bookingRepository: createBookingRepository(db, client, { now }),
        staffSessionRepository: createStaffSessionRepository(db, { now }),
        checkInRepository: createCheckInRepository(db, { now }),
        sessionMetricsRepository: createSessionMetricsRepository(db),
        notificationRepository: createNotificationRepository(db),
      })
    );
    async function request(
      path,
      { token, method = 'GET', body, status = 200 } = {}
    ) {
      const response = await fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json();
      assert.equal(
        response.status,
        status,
        `${method} ${path}: ${payload.error?.code ?? response.status}`
      );
      return payload;
    }
    async function staff(index) {
      const staffId = `JOURNEY-STAFF-${index}`,
        password = 'Test-only-password123';
      await request('/staff/auth/register', {
        method: 'POST',
        status: 201,
        body: {
          fullName: 'Fictional Staff',
          staffId,
          password,
          role: 'RECEPTION',
          hospital: `Journey Hospital ${index}`,
          hospitalId: hospitals[index].toString(),
          mobile: `+9477000010${index}`,
          email: `journey-staff-${index}@example.test`,
        },
      });
      return (
        await request('/staff/auth/sign-in', {
          method: 'POST',
          body: { staffId, password },
        })
      ).data.accessToken;
    }
    async function patient(index) {
      const nic = `20001234567${index}`,
        password = 'Test-only-password123';
      await request('/auth/patient/register', {
        method: 'POST',
        status: 201,
        body: {
          fullName: 'Fictional Patient',
          nic,
          password,
          mobile: `077000020${index}`,
        },
      });
      return (
        await request('/auth/patient/login', {
          method: 'POST',
          body: { nic, password },
        })
      ).data;
    }
    const staffToken = await staff(0),
      foreignStaffToken = await staff(1);
    const owner = await patient(0),
      other = await patient(1);
    const createBody = {
      serviceId: serviceId.toString(),
      sessionDate: '2026-10-07',
      startTime: '09:00',
      endTime: '12:00',
      capacity: 2,
      doctorOrTeam: 'Fictional OPD team',
    };
    await request('/staff/sessions', {
      token: owner.accessToken,
      method: 'POST',
      body: createBody,
      status: 403,
    });
    const session = (
      await request('/staff/sessions', {
        token: staffToken,
        method: 'POST',
        body: createBody,
        status: 201,
      })
    ).data;
    assert.equal(session.bookedCount, 0);
    assert.equal(session.hospitalId, hospitals[0].toString());

    // Consume only IDs returned by public discovery, then compare to staff's saved session.
    const found = await request('/hospitals?search=Journey%20Hospital%200');
    const hospitalPath = `/hospitals/${found.data[0]._id}`;
    const services = await request(`${hospitalPath}/services`);
    const availabilityPath = `${hospitalPath}/sessions?date=2026-10-07&serviceId=${services.data[0]._id}`;
    const publicSession = (await request(availabilityPath)).data[0];
    assert.equal(publicSession._id, session._id);
    assert.equal(publicSession.remainingCapacity, 2);
    assert.equal(publicSession.isBookable, true);
    assert.equal(publicSession.startsAt, '2026-10-07T03:30:00.000Z');
    assert.equal('createdById' in publicSession, false);
    const booking = (
      await request('/bookings', {
        token: owner.accessToken,
        method: 'POST',
        body: { sessionId: publicSession._id },
        status: 201,
      })
    ).data;
    const bookingPath = `/bookings/${booking._id}`,
      staffPath = `/staff/sessions/${session._id}`;
    assert.equal(
      (await request(`${staffPath}`, { token: staffToken })).data.bookedCount,
      1
    );
    assert.equal(
      (await request(availabilityPath)).data[0].remainingCapacity,
      1
    );
    assert.equal(
      (
        await request('/bookings/me?status=upcoming', {
          token: owner.accessToken,
        })
      ).data[0]._id,
      booking._id
    );
    await request(bookingPath, { token: other.accessToken, status: 404 });

    // Staff edits must feed patient availability and saved summaries, not just staff lists.
    await request(staffPath, {
      token: foreignStaffToken,
      method: 'PATCH',
      body: { capacity: 3 },
      status: 404,
    });
    await request(staffPath, {
      token: staffToken,
      method: 'PATCH',
      body: { capacity: 3, doctorOrTeam: 'Updated OPD team' },
    });
    const staleSelection = (await request(availabilityPath)).data[0];
    assert.equal(staleSelection.remainingCapacity, 2);
    assert.equal(staleSelection.doctorOrTeam, 'Updated OPD team');
    assert.equal(
      (await request(bookingPath, { token: owner.accessToken })).data.session
        .doctorOrTeam,
      'Updated OPD team'
    );
    await request(`${staffPath}/close-bookings`, {
      token: staffToken,
      method: 'PATCH',
      body: {},
    });
    assert.deepEqual((await request(availabilityPath)).data, []);
    const rejected = await request('/bookings', {
      token: other.accessToken,
      method: 'POST',
      body: { sessionId: staleSelection._id },
      status: 409,
    });
    assert.equal(rejected.error.code, 'SESSION_UNAVAILABLE');
    const saved = (await request(bookingPath, { token: owner.accessToken }))
      .data;
    assert.equal(saved.bookingCode, booking.bookingCode);
    assert.equal(saved.status, 'CONFIRMED');
    assert.equal(saved.session.status, 'CLOSED');

    // Closing new bookings must not cancel an existing booking or reserve another place on check-in.
    await request(`${bookingPath}/check-in`, {
      token: owner.accessToken,
      method: 'POST',
      body: {},
      status: 403,
    });
    await request(`${bookingPath}/check-in`, {
      token: foreignStaffToken,
      method: 'POST',
      body: {},
      status: 404,
    });
    const checkIn = (
      await request(`${bookingPath}/check-in`, {
        token: staffToken,
        method: 'POST',
        body: {},
      })
    ).data;
    assert.equal(checkIn.queueNumber, 1);
    assert.equal(checkIn.status, 'WAITING');
    assert.deepEqual(
      (
        await request(`${bookingPath}/check-in`, {
          token: staffToken,
          method: 'POST',
          body: {},
        })
      ).data,
      checkIn
    );
    const metrics = (
      await request(`${staffPath}/metrics`, { token: staffToken })
    ).data;
    assert.equal(metrics.bookedCount, 1);
    assert.equal(metrics.capacity, 3);
    assert.equal(metrics.waitingCount, 1);
    assert.equal(metrics.patientsCheckedIn, 1);
    await request(`${staffPath}/metrics`, {
      token: foreignStaffToken,
      status: 404,
    });
    const alerts = await request('/notifications', {
      token: owner.accessToken,
    });
    const confirmations = alerts.data.filter(
      (item) => item.data?.event === 'BOOKING_CONFIRMED'
    );
    assert.equal(confirmations.length, 1);
    assert.equal(confirmations[0].data.bookingId, booking._id);
    assert.deepEqual(
      (await request('/notifications', { token: other.accessToken })).data,
      []
    );
    assert.equal(await db.collection('bookings').countDocuments({}), 1);
    assert.equal(await db.collection('queueEntries').countDocuments({}), 1);
    assert.equal(
      (
        await db
          .collection('opdSessions')
          .findOne({ _id: new ObjectId(session._id) })
      ).bookedCount,
      1
    );
  }
);
