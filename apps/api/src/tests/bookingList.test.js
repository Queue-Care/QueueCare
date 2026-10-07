import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createApp } from '../app.js';
import { authenticate } from '../middleware/auth.js';
import { readAuthConfig } from '../config/auth.js';
import {
  createBookingRepository,
  ensureBookingIndexes,
} from '../modules/bookings/bookingRepository.js';
import { createHospitalRepository } from '../modules/hospitals/hospitalRepository.js';
import {
  createPatientRegistrationRepository,
  ensurePatientRegistrationIndexes,
} from '../modules/auth/patientRegistration.js';
import { startHttp, startMongo } from './testServer.js';
import { createNotificationRepository } from '../modules/notifications/g_notificationRepository.js';
import { ensureBookingNotificationIndexes } from '../modules/bookings/bookingNotification.js';

const id = (n) => new ObjectId(n.toString(16).padStart(24, '0'));
const at = new Date('2026-10-05T04:00:00Z'); // 09:30 in Sri Lanka.
test(
  'registered patients can book, read Home/My Bookings pages, and open their saved details',
  { timeout: 60000 },
  async (t) => {
    const { db, client } = await startMongo(t, { replicaSet: true });
    await ensureBookingIndexes(db);
    await ensureBookingNotificationIndexes(db);
    await ensurePatientRegistrationIndexes(db);
    const config = readAuthConfig({
      JWT_SECRET: 'test-only-booking-list-secret-not-for-app-use',
    });
    const repository = createBookingRepository(db, client, { now: () => at });
    const app = createApp({
      hospitalRepository: createHospitalRepository(db, { now: () => at }),
      bookingRepository: repository,
      notificationRepository: createNotificationRepository(db),
      patientRegistrationRepository: createPatientRegistrationRepository(db),
      authConfig: config,
      authenticate: authenticate(db, config),
      checkDatabase: () => db.command({ ping: 1 }),
    });
    const base = await startHttp(t, app);
    async function request(path, token, body, method = body ? 'POST' : 'GET') {
      const response = await fetch(`${base}/api/v1${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: response.status,
        cache: response.headers.get('cache-control'),
        body: await response.json(),
      };
    }
    async function account(nic, mobile) {
      assert.equal(
        (
          await request('/auth/patient/register', null, {
            fullName: 'Integration Patient',
            nic,
            mobile,
            password: 'Test-only-password123',
          })
        ).status,
        201
      );
      const login = await request('/auth/patient/login', null, {
        nic,
        password: 'Test-only-password123',
      });
      assert.equal(login.status, 200);
      return login.body.data;
    }
    const patient = await account('200012345678', '0771234567');
    const other = await account('200012345679', '0771234568');
    const patientId = new ObjectId(patient.userId);
    await db.collection('hospitals').insertOne({
      _id: id(100),
      name: 'Integration Hospital',
      address: 'Test address',
      city: 'Colombo',
      isActive: true,
    });
    await db.collection('opdServices').insertOne({
      _id: id(200),
      hospitalId: id(100),
      name: 'General OPD',
      isActive: true,
    });
    const slot = {
      hospitalId: id(100),
      serviceId: id(200),
      doctorOrTeam: 'Test team',
      sessionDate: new Date('2026-10-05T00:00:00Z'),
      status: 'OPEN',
      capacity: 20,
      bookedCount: 0,
    };
    await db.collection('opdSessions').insertOne({
      ...slot,
      _id: id(300),
      startTime: '10:00',
      endTime: '11:00',
    });
    const created = await request('/bookings', patient.accessToken, {
      sessionId: id(300).toString(),
    });
    assert.equal(created.status, 201);
    const bookingId = created.body.data._id;
    await t.test(
      'committed booking notification can be listed, opened and marked read only by its patient',
      async () => {
        const alerts = await request('/notifications', patient.accessToken);
        assert.equal(alerts.status, 200);
        assert.equal(alerts.cache, 'no-store');
        assert.equal(alerts.body.meta.unreadCount, 1);
        assert.equal(alerts.body.data.length, 1);
        const notice = alerts.body.data[0];
        assert.equal(notice.type, 'BOOKING');
        assert.equal(notice.data.event, 'BOOKING_CONFIRMED');
        assert.equal(notice.data.bookingId, bookingId);
        assert.equal(notice.readAt, null);
        assert.equal(notice.userId, undefined);
        const opened = await request(
          `/bookings/${notice.data.bookingId}`,
          patient.accessToken
        );
        assert.equal(opened.status, 200);
        assert.equal(
          opened.body.data.bookingCode,
          created.body.data.bookingCode
        );
        assert.deepEqual(
          (await request('/notifications', other.accessToken)).body.data,
          []
        );
        assert.equal(
          (
            await request(
              `/notifications/${notice._id}/read`,
              other.accessToken,
              undefined,
              'PATCH'
            )
          ).status,
          404
        );
        assert.equal(
          (
            await request(
              `/bookings/${notice.data.bookingId}`,
              other.accessToken
            )
          ).status,
          404
        );
        const marked = await request(
          `/notifications/${notice._id}/read`,
          patient.accessToken,
          undefined,
          'PATCH'
        );
        assert.equal(marked.status, 200);
        assert.equal(marked.body.meta.unreadCount, 0);
        assert.ok(marked.body.data.readAt);
        const duplicate = await request('/bookings', patient.accessToken, {
          sessionId: id(300).toString(),
        });
        assert.equal(duplicate.status, 409);
        const again = await request('/notifications', patient.accessToken);
        assert.equal(again.body.data.length, 1);
        assert.equal(again.body.data[0].readAt, marked.body.data.readAt);
        assert.equal(again.body.meta.unreadCount, 0);
      }
    );
    const list = (query = '', token = patient.accessToken) =>
      request(`/bookings/me${query}`, token);
    await t.test(
      'real login token authorizes booking -> Home -> list -> details without private projections',
      async () => {
        const result = await list('?status=upcoming&limit=1');
        assert.equal(result.status, 200);
        assert.equal(result.cache, 'no-store');
        assert.deepEqual(result.body.data, [
          {
            _id: bookingId,
            bookingCode: created.body.data.bookingCode,
            hospitalName: 'Integration Hospital',
            serviceName: 'General OPD',
            status: 'CONFIRMED',
            startsAt: '2026-10-05T04:30:00.000Z',
          },
        ]);
        assert.deepEqual(result.body.meta, {
          page: 1,
          limit: 1,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
        });
        const detail = await request(
          `/bookings/${result.body.data[0]._id}`,
          patient.accessToken
        );
        assert.equal(detail.status, 200);
        assert.equal(
          detail.body.data.bookingCode,
          result.body.data[0].bookingCode
        );
        assert.equal((await list('?status=past')).body.data.length, 0);
        assert.equal((await list('', other.accessToken)).body.data.length, 0);
        assert.equal(
          (await request(`/bookings/${bookingId}`, other.accessToken)).status,
          404
        );
        assert.equal(
          await db
            .collection('notifications')
            .countDocuments({ userId: patientId }),
          1
        );
        assert.equal(
          (await db.collection('opdSessions').findOne({ _id: id(300) }))
            .bookedCount,
          1
        );
      }
    );
    async function saved(
      n,
      startTime,
      endTime,
      status = 'CONFIRMED',
      sessionStatus = 'OPEN'
    ) {
      await db.collection('opdSessions').insertOne({
        ...slot,
        _id: id(n),
        startTime,
        endTime,
        status: sessionStatus,
      });
      await db.collection('bookings').insertOne({
        _id: id(n + 1000),
        patientId,
        sessionId: id(n),
        status,
        bookingCode: `TEST-${n}`,
        createdAt: at,
        updatedAt: at,
      });
    }
    await saved(301, '09:00', '10:00'); // Ongoing comes before a future booking.
    await saved(302, '08:00', '09:30'); // Exact end boundary is past.
    await saved(303, '12:00', '13:00', 'CANCELLED');
    await saved(304, '13:00', '14:00', 'CONFIRMED', 'CANCELLED');
    await saved(305, '07:00', '08:00', 'CONFIRMED', 'RUNNING'); // Delayed running session.
    await saved(306, '10:00', '11:00'); // Equal start tie break.
    await t.test(
      'filters before limit, handles running/end/cancelled states, and pages stably',
      async () => {
        const first = await list('?status=upcoming&limit=1');
        assert.equal(first.body.data[0].bookingCode, 'TEST-305');
        const all = await list();
        assert.deepEqual(
          all.body.data.map((b) => b.bookingCode),
          ['TEST-305', 'TEST-301', 'TEST-306', created.body.data.bookingCode]
        );
        const second = await list('?limit=2&page=2');
        assert.deepEqual(second.body.data, all.body.data.slice(2));
        assert.equal(second.body.meta.total, 4);
        assert.equal(second.body.meta.hasNextPage, false);
        const past = await list('?status=past');
        assert.deepEqual(
          past.body.data.map((b) => b.bookingCode),
          ['TEST-304', 'TEST-303', 'TEST-302']
        );
        const beyond = await list('?page=20');
        assert.deepEqual(beyond.body.data, []);
        assert.equal(beyond.body.meta.total, 4);
      }
    );
    await t.test(
      'rejects missing credentials, wrong role, suspended account and injected or repeated filters',
      async () => {
        assert.equal((await list('', null)).status, 401);
        for (const query of [
          '?status=bad',
          '?status=past&status=upcoming',
          '?page=0',
          '?page=01',
          '?page=1001',
          '?limit=51',
          '?limit=1&limit=2',
          '?patientId=' + other.userId,
          '?status[$ne]=past',
        ])
          assert.equal((await list(query)).status, 400, query);
        await db
          .collection('users')
          .updateOne({ _id: patientId }, { $set: { role: 'NURSE' } });
        assert.equal((await list()).status, 403);
        await db
          .collection('users')
          .updateOne(
            { _id: patientId },
            { $set: { role: 'PATIENT', status: 'SUSPENDED' } }
          );
        assert.equal((await list()).status, 403);
        await db
          .collection('users')
          .updateOne({ _id: patientId }, { $set: { status: 'ACTIVE' } });
      }
    );
    await t.test(
      'inactive parents remain readable and missing linked records fail instead of silently emptying Home',
      async () => {
        await db
          .collection('hospitals')
          .updateOne({ _id: id(100) }, { $set: { isActive: false } });
        assert.equal((await list()).status, 200);
        await db.collection('opdSessions').deleteOne({ _id: id(305) });
        assert.equal((await list('?limit=1')).status, 409);
        assert.deepEqual((await list('', other.accessToken)).body.data, []);
      }
    );
    await t.test(
      'storage errors remain failures with no driver detail or successful empty fallback',
      async () => {
        repository.list = async () => {
          throw new Error('private database diagnostic');
        };
        const result = await list();
        assert.equal(result.status, 500);
        assert.equal(result.body.data, undefined);
        assert.equal(
          JSON.stringify(result.body).includes('private database'),
          false
        );
      }
    );
  }
);
