import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignJWT } from 'jose';
import { ObjectId } from 'mongodb';
import { createApp } from '../app.js';
import { readAuthConfig } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import {
  createNotificationRepository,
  ensureNotificationIndexes,
} from '../modules/notifications/g_notificationRepository.js';
import {
  createPriorityRepository,
  ensurePriorityIndexes,
} from '../modules/priority/g_priorityRepository.js';
import {
  createStaffAuthRepository,
  ensureStaffAuthIndexes,
} from '../modules/staff/g_staffAuthRepository.js';
import { createStaffDashboardRepository } from '../modules/staff/g_staffDashboard.js';
import { createProfileRepository } from '../modules/users/g_profileRepository.js';
import {
  createMongoMediaStore,
  ensureProfileImageIndexes,
} from '../modules/media/g_mongoMediaStore.js';
import { demoHospitals } from '../seeds/hospitals.js';
import { seedPriorityDemo } from '../seeds/g_priorityDemo.js';
import { startHttp, startMongo } from './testServer.js';

const authConfig = readAuthConfig({ JWT_SECRET: 'm4-test-secret-'.repeat(4) });

async function setup(t, { mediaStore } = {}) {
  const { db } = await startMongo(t);
  await ensureStaffAuthIndexes(db);
  await ensureNotificationIndexes(db);
  await ensurePriorityIndexes(db);
  await ensureProfileImageIndexes(db);
  const profileImageStore = createMongoMediaStore(db);
  if (mediaStore === 'mongodb') mediaStore = profileImageStore;
  const priorityRepository = createPriorityRepository(db);
  const notificationRepository = createNotificationRepository(db);
  const base = await startHttp(
    t,
    createApp({
      checkDatabase: () => db.command({ ping: 1 }),
      staffAuthRepository: createStaffAuthRepository(db, authConfig),
      staffDashboardRepository: createStaffDashboardRepository(db, {
        priorityRepository,
        notificationRepository,
      }),
      priorityRepository,
      notificationRepository,
      profileRepository: createProfileRepository(db, { mediaStore }),
      profileImageStore,
      authenticate: authenticate(db, authConfig),
    })
  );
  async function call(method, path, { token, body } = {}) {
    const response = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, ...(await response.json()) };
  }
  async function staff(staffId, hospital) {
    const account = {
      fullName: 'Nimasha Fernando',
      staffId,
      ...hospital,
      role: 'RECEPTION',
      mobile: '+94 71 998 2210',
      email: `${staffId.toLowerCase()}@example.org`,
      password: 'correct-horse-battery',
    };
    const registered = await call('POST', '/staff/auth/register', {
      body: account,
    });
    assert.equal(registered.status, 201);
    const signedIn = await call('POST', '/staff/auth/sign-in', {
      body: { staffId, password: account.password },
    });
    assert.equal(signedIn.status, 200);
    return { ...signedIn.data.user, token: signedIn.data.accessToken, account };
  }
  // Sends one file in the multipart "image" field, as the mobile app does.
  async function upload(token, bytes, type = 'image/jpeg') {
    const body = new FormData();
    if (bytes) body.append('image', new Blob([bytes], { type }), 'photo.jpg');
    const response = await fetch(`${base}/api/v1/me/profile-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    return { status: response.status, ...(await response.json()) };
  }
  return { db, call, staff, upload, base };
}

async function tokenFor(userId) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId.toString())
    .setIssuer(authConfig.issuer)
    .setAudience(authConfig.audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 600)
    .sign(authConfig.key);
}

test(
  'staff registration links a hospital and sign-in opens the dashboard',
  { timeout: 60000 },
  async (t) => {
    const { db, call, staff } = await setup(t);
    const seeded = await seedPriorityDemo(db);
    assert.equal(seeded.inserted, 5);
    // Re-running the seed never duplicates demo data.
    assert.equal((await seedPriorityDemo(db)).inserted, 0);

    // A typed hospital name is matched to its record regardless of letter case.
    const reception = await staff('CNH-RC-0421', {
      hospital: 'demo central hospital',
    });
    assert.equal(reception.hospital, demoHospitals[0].name);
    const saved = await db
      .collection('users')
      .findOne({ staffId: 'CNH-RC-0421' });
    assert.ok(saved.hospitalId.equals(demoHospitals[0]._id));
    assert.ok(saved.lastLoginAt instanceof Date);
    assert.notEqual(saved.passwordHash, reception.account.password);

    const duplicate = await call('POST', '/staff/auth/register', {
      body: reception.account,
    });
    assert.equal(duplicate.status, 409);
    const unknownHospital = await call('POST', '/staff/auth/register', {
      body: {
        ...reception.account,
        staffId: 'CNH-RC-0999',
        email: 'other@example.org',
        hospitalId: new ObjectId().toString(),
      },
    });
    assert.equal(unknownHospital.status, 400);
    assert.ok(unknownHospital.error.fieldErrors.hospitalId);
    const wrongPassword = await call('POST', '/staff/auth/sign-in', {
      body: { staffId: 'CNH-RC-0421', password: 'not-the-password' },
    });
    assert.equal(wrongPassword.status, 401);

    const dashboard = await call('GET', '/staff/dashboard', {
      token: reception.token,
    });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.data.staff.fullName, 'Nimasha Fernando');
    assert.equal(dashboard.data.sessionsToday, 4);
    assert.equal(dashboard.data.sessions.length, 4);
    assert.equal(dashboard.data.priorityWaiting, 4);
    assert.equal(dashboard.data.patientsCheckedIn, 0);
    assert.equal(dashboard.data.nowServing, null);
    assert.equal(dashboard.data.unreadNotifications, 1);
    assert.equal((await call('GET', '/staff/dashboard')).status, 401);
  }
);

test(
  'staff review priority requests and each decision is recorded once',
  { timeout: 60000 },
  async (t) => {
    const { db, call, staff } = await setup(t);
    await seedPriorityDemo(db);
    const reception = await staff('CNH-RC-0421', {
      hospitalId: demoHospitals[0]._id.toString(),
      hospital: demoHospitals[0].name,
    });
    const elsewhere = await staff('DLH-RC-0001', {
      hospitalId: demoHospitals[1]._id.toString(),
      hospital: demoHospitals[1].name,
    });
    const { token } = reception;

    const pending = await call('GET', '/staff/priority-requests', { token });
    assert.equal(pending.status, 200);
    assert.equal(pending.meta.pendingCount, 4);
    assert.deepEqual(
      pending.data.map((item) => item.patient.fullName),
      ['Dinithi Perera', 'Ruwan Fernando', 'Amaya Silva', 'Kasun Perera']
    );
    assert.ok(pending.data.every((item) => item.status === 'PENDING'));
    // Contact details stay out of the list response.
    assert.ok(pending.data.every((item) => !('phone' in item.patient)));
    const decided = await call(
      'GET',
      '/staff/priority-requests?status=decided',
      { token }
    );
    assert.deepEqual(
      decided.data.map((item) => item.status),
      ['ACCEPTED']
    );
    assert.equal(
      (await call('GET', '/staff/priority-requests?status=all', { token }))
        .status,
      400
    );

    const kasun = pending.data.at(-1);
    const details = await call(
      'GET',
      `/staff/priority-requests/${kasun._id}`,
      { token }
    );
    assert.equal(details.data.reason, 'ELDERLY');
    assert.equal(details.data.patient.maskedNic, '········234V');
    assert.ok(details.data.patient.phone);
    assert.match(details.data.booking.bookingCode, /^OPD-DEMO-/);
    assert.ok(details.data.session.startsAt);

    // Another hospital's staff cannot see or decide this request.
    const other = await call('GET', '/staff/priority-requests', {
      token: elsewhere.token,
    });
    assert.deepEqual(other.data, []);
    assert.equal(
      (
        await call('PATCH', `/staff/priority-requests/${kasun._id}/decision`, {
          token: elsewhere.token,
          body: { decision: 'ACCEPTED' },
        })
      ).status,
      404
    );
    // Patients are refused, including the patient who made the request.
    const request = await db
      .collection('priorityRequests')
      .findOne({ _id: new ObjectId(kasun._id) });
    const patientToken = await tokenFor(request.patientId);
    assert.equal(
      (
        await call('PATCH', `/staff/priority-requests/${kasun._id}/decision`, {
          token: patientToken,
          body: { decision: 'ACCEPTED' },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await call('PATCH', `/staff/priority-requests/${kasun._id}/decision`, {
          token,
          body: { decision: 'MAYBE' },
        })
      ).status,
      400
    );

    // A checked-in patient moves to the priority queue when accepted.
    await db.collection('queueEntries').insertOne({
      bookingId: request.bookingId,
      patientId: request.patientId,
      queueNumber: 14,
      priorityLevel: 'NORMAL',
      status: 'WAITING',
    });
    const accepted = await call(
      'PATCH',
      `/staff/priority-requests/${kasun._id}/decision`,
      { token, body: { decision: 'ACCEPTED' } }
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.status, 'ACCEPTED');
    assert.equal(accepted.data.queuePriority, 'APPROVED_PRIORITY');
    assert.ok(accepted.data.reviewedAt);
    const again = await call(
      'PATCH',
      `/staff/priority-requests/${kasun._id}/decision`,
      { token, body: { decision: 'DECLINED' } }
    );
    assert.equal(again.status, 409);
    assert.equal(again.error.code, 'PRIORITY_REQUEST_ALREADY_DECIDED');

    const amaya = pending.data[2];
    const declined = await call(
      'PATCH',
      `/staff/priority-requests/${amaya._id}/decision`,
      {
        token,
        body: { decision: 'DECLINED', decisionNote: ' Session is full. ' },
      }
    );
    assert.equal(declined.data.status, 'DECLINED');
    assert.equal(declined.data.decisionNote, 'Session is full.');

    const stored = await db
      .collection('priorityRequests')
      .findOne({ _id: request._id });
    assert.equal(stored.status, 'ACCEPTED');
    assert.ok(stored.reviewedById.equals(new ObjectId(reception.userId)));
    assert.equal(
      (await call('GET', '/staff/priority-requests', { token })).meta
        .pendingCount,
      2
    );
    assert.deepEqual(
      (
        await db
          .collection('auditLogs')
          .find({ entityType: 'priorityRequest' })
          .sort({ createdAt: 1 })
          .toArray()
      ).map((log) => log.action),
      ['PRIORITY_REQUEST_ACCEPTED', 'PRIORITY_REQUEST_DECLINED']
    );

    // The patient reads the decision from their own notifications.
    const alerts = await call('GET', '/notifications', { token: patientToken });
    assert.equal(alerts.meta.unreadCount, 1);
    assert.equal(alerts.data[0].title, 'Priority request accepted');
    assert.equal(alerts.data[0].data.requestId, kasun._id);
  }
);

test(
  'notifications and profile changes are saved for the signed-in account',
  { timeout: 60000 },
  async (t) => {
    const { db, call, staff } = await setup(t);
    const first = await staff('CNH-RC-0421', { hospital: 'Unlisted Hospital' });
    const second = await staff('CNH-RC-0422', { hospital: 'Unlisted Hospital' });
    const { token } = first;
    const userId = new ObjectId(first.userId);
    await db.collection('notifications').insertOne({
      userId,
      type: 'PRIORITY',
      title: 'New priority request',
      message: 'A patient asked for priority assistance.',
      data: {},
      readAt: null,
      createdAt: new Date(Date.now() + 1000),
    });

    const list = await call('GET', '/notifications', { token });
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.data.map((item) => item.title),
      ['New priority request', 'Staff account created']
    );
    assert.equal(list.meta.unreadCount, 2);
    const [newest, welcome] = list.data;

    const read = await call('PATCH', `/notifications/${newest._id}/read`, {
      token,
    });
    assert.ok(read.data.readAt);
    assert.equal(read.meta.unreadCount, 1);
    // Another account cannot read or delete this user's notifications.
    assert.equal(
      (
        await call('PATCH', `/notifications/${welcome._id}/read`, {
          token: second.token,
        })
      ).status,
      404
    );
    assert.equal(
      (
        await call('DELETE', `/notifications/${welcome._id}`, {
          token: second.token,
        })
      ).status,
      404
    );
    const all = await call('PATCH', '/notifications/read-all', { token });
    assert.equal(all.data.updated, 1);
    assert.equal((await call('GET', '/notifications', { token })).meta.unreadCount, 0);
    const removed = await call('DELETE', `/notifications/${welcome._id}`, {
      token,
    });
    assert.equal(removed.status, 200);
    assert.equal(
      (await call('DELETE', `/notifications/${welcome._id}`, { token })).status,
      404
    );
    assert.equal((await call('GET', '/notifications', { token })).data.length, 1);
    assert.equal((await call('GET', '/notifications')).status, 401);
    assert.equal(
      (await call('PATCH', '/notifications/not-an-id/read', { token })).status,
      400
    );

    const profile = await call('GET', '/me', { token });
    assert.equal(profile.data.staffId, 'CNH-RC-0421');
    assert.equal(profile.data.phone, '+94 71 998 2210');
    assert.equal(profile.data.preferredLanguage, 'en');
    assert.equal(profile.data.notificationsEnabled, true);
    assert.ok(!('passwordHash' in profile.data));

    const updated = await call('PATCH', '/me', {
      token,
      body: { fullName: ' Nimasha F. Perera ', phone: '+94 77 123 4567' },
    });
    assert.equal(updated.data.fullName, 'Nimasha F. Perera');
    assert.equal(updated.data.phone, '+94 77 123 4567');
    const stored = await db.collection('users').findOne({ _id: userId });
    assert.equal(stored.mobile, '+94 77 123 4567');
    assert.equal(
      (await call('PATCH', '/me', { token, body: { role: 'ADMIN' } })).status,
      400
    );
    assert.equal(
      (await call('PATCH', '/me', { token, body: { phone: 'abc' } })).status,
      400
    );
    const taken = await call('PATCH', '/me', {
      token,
      body: { email: second.account.email },
    });
    assert.equal(taken.status, 409);

    const preferences = await call('PATCH', '/me/preferences', {
      token,
      body: { preferredLanguage: 'si', notificationsEnabled: false },
    });
    assert.equal(preferences.data.preferredLanguage, 'si');
    assert.equal(preferences.data.notificationsEnabled, false);
    assert.equal(
      (
        await call('PATCH', '/me/preferences', {
          token,
          body: { preferredLanguage: 'fr' },
        })
      ).status,
      400
    );
    assert.equal((await call('GET', '/me', { token })).data.preferredLanguage, 'si');
  }
);

test(
  'a profile photo is stored in the media store and only its URL in MongoDB',
  { timeout: 60000 },
  async (t) => {
    // Stands in for Cloudinary so the test never needs real credentials.
    const stored = new Map();
    const mediaStore = {
      async upload(buffer, publicId) {
        stored.set(publicId, buffer);
        return {
          url: `https://res.cloudinary.com/demo/image/upload/v${stored.size}/${publicId}.jpg`,
          publicId,
        };
      },
      async remove(publicId) {
        stored.delete(publicId);
      },
    };
    const { db, call, staff, upload } = await setup(t, { mediaStore });
    const { token, userId } = await staff('CNH-RC-0421', {
      hospital: 'Unlisted Hospital',
    });
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(64, 1),
    ]);

    assert.equal((await upload(undefined, jpeg)).status, 401);
    assert.equal((await upload(token)).status, 400);
    const text = await upload(token, Buffer.from('this is not an image file'));
    assert.equal(text.status, 400);
    assert.ok(text.error.fieldErrors.image);
    const large = await upload(
      token,
      Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024)])
    );
    assert.equal(large.status, 413);
    assert.equal(stored.size, 0);

    const saved = await upload(token, jpeg);
    assert.equal(saved.status, 201);
    const publicId = `queuecare/profiles/${userId}`;
    assert.match(saved.data.profileImageUrl, /^https:\/\/res\.cloudinary\.com\//);
    assert.ok(stored.get(publicId).equals(jpeg));
    const user = await db
      .collection('users')
      .findOne({ staffId: 'CNH-RC-0421' });
    assert.equal(user.profileImagePublicId, publicId);
    assert.equal(user.profileImageUrl, saved.data.profileImageUrl);
    // The public ID is an internal reference and never leaves the API.
    assert.ok(!('profileImagePublicId' in saved.data));
    assert.equal(
      (await call('GET', '/me', { token })).data.profileImageUrl,
      saved.data.profileImageUrl
    );

    // A second upload replaces the first instead of adding another file.
    const replaced = await upload(token, jpeg);
    assert.notEqual(replaced.data.profileImageUrl, undefined);
    assert.equal(stored.size, 1);

    const removed = await call('DELETE', '/me/profile-image', { token });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.profileImageUrl, null);
    assert.equal(stored.size, 0);
    const cleared = await db
      .collection('users')
      .findOne({ staffId: 'CNH-RC-0421' });
    assert.ok(!('profileImageUrl' in cleared));
    assert.ok(!('profileImagePublicId' in cleared));
    // Removing again is harmless.
    assert.equal(
      (await call('DELETE', '/me/profile-image', { token })).status,
      200
    );
  }
);

test(
  'photo upload answers 503 when no photo store is available',
  { timeout: 60000 },
  async (t) => {
    const { staff, upload } = await setup(t);
    const { token } = await staff('CNH-RC-0421', {
      hospital: 'Unlisted Hospital',
    });
    const result = await upload(
      token,
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])
    );
    assert.equal(result.status, 503);
    assert.equal(result.error.code, 'MEDIA_NOT_CONFIGURED');
  }
);

test(
  'without Cloudinary a profile photo is saved in MongoDB and served back',
  { timeout: 60000 },
  async (t) => {
    const { db, call, staff, upload, base } = await setup(t, {
      mediaStore: 'mongodb',
    });
    const { token, userId } = await staff('CNH-RC-0421', {
      hospital: 'Unlisted Hospital',
    });
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(200, 7),
    ]);
    const view = (path) => fetch(`${base}/api/v1${path}`);

    const saved = await upload(token, jpeg);
    assert.equal(saved.status, 201);
    // A path relative to the API base URL, with an unguessable token.
    assert.match(saved.data.profileImageUrl, /^\/media\/profile-images\/[a-f\d]{32}$/);
    const stored = await db
      .collection('profileImages')
      .findOne({ _id: `queuecare/profiles/${userId}` });
    assert.ok(Buffer.from(stored.data.buffer).equals(jpeg));
    assert.equal(stored.contentType, 'image/jpeg');
    assert.equal(
      (await call('GET', '/me', { token })).data.profileImageUrl,
      saved.data.profileImageUrl
    );
    assert.equal(
      (await call('GET', '/staff/dashboard', { token })).data.staff
        .profileImageUrl,
      saved.data.profileImageUrl
    );

    // The phone's <Image> loads the photo from that address without a token.
    const shown = await view(saved.data.profileImageUrl);
    assert.equal(shown.status, 200);
    assert.equal(shown.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await shown.arrayBuffer()).equals(jpeg));

    // A new upload replaces the photo; the old address stops working.
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(100, 3),
    ]);
    const replaced = await upload(token, png, 'image/png');
    assert.notEqual(replaced.data.profileImageUrl, saved.data.profileImageUrl);
    assert.equal(await db.collection('profileImages').countDocuments(), 1);
    assert.equal((await view(saved.data.profileImageUrl)).status, 404);
    const updated = await view(replaced.data.profileImageUrl);
    assert.equal(updated.headers.get('content-type'), 'image/png');

    const removed = await call('DELETE', '/me/profile-image', { token });
    assert.equal(removed.data.profileImageUrl, null);
    assert.equal(await db.collection('profileImages').countDocuments(), 0);
    assert.equal((await view(replaced.data.profileImageUrl)).status, 404);
    assert.equal((await view('/media/profile-images/not-a-token')).status, 404);
  }
);
