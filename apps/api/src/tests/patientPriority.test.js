import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { createApp } from '../app.js';
import { authenticate } from '../middleware/auth.js';
import { readAuthConfig } from '../config/auth.js';
import { createPatientPriorityRepository, ensurePatientPriorityIndexes } from '../modules/priority/patientPriorityRepository.js';
import { createPriorityRepository, ensurePriorityIndexes } from '../modules/priority/g_priorityRepository.js';
import { parsePrioritySubmission } from '../modules/priority/patientPriorityRoutes.js';
import { startHttp } from './testServer.js';

test('priority submission rejects forged identity, invalid reasons, long notes, IDs and queries', () => {
  const id = new ObjectId().toString();
  assert.equal(parsePrioritySubmission({ reason: 'MOBILITY', note: '  help  ' }, id).note, 'help');
  for (const body of [null, [], { reason: 'INVALID' }, { reason: 'OTHER', patientId: id }, { reason: 'OTHER', status: 'ACCEPTED' }, { reason: 'OTHER', note: 'x'.repeat(501) }, { reason: 'OTHER', note: 1 }])
    assert.throws(() => parsePrioritySubmission(body, id), { status: 400 });
  assert.throws(() => parsePrioritySubmission({ reason: 'OTHER' }, 'invalid'), { status: 400 });
  assert.throws(() => parsePrioritySubmission({ reason: 'OTHER' }, id, { patientId: id }), { status: 400 });
});

test('patient priority HTTP routes require authentication and patient role', async t => {
  const id = new ObjectId();
  let calls = 0;
  const base = await startHttp(t, createApp({
    authenticate: (request, _response, next) => {
      const role = request.get('test-role');
      if (role) request.auth = { userId: id, role };
      next();
    },
    patientPriorityRepository: { create: async (patientId) => { assert.ok(patientId.equals(id)); calls++; return { status: 'PENDING' }; }, list: async () => [] },
  }));
  for (const [role, status] of [[undefined, 401], ['NURSE', 403], ['PATIENT', 201]]) {
    const response = await fetch(`${base}/api/v1/bookings/${id}/priority-requests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(role ? { 'test-role': role } : {}) }, body: JSON.stringify({ reason: 'OTHER' }),
    });
    assert.equal(response.status, status);
  }
  assert.equal(calls, 1);
  const response = await fetch(`${base}/api/v1/priority-requests/me`, { headers: { 'test-role': 'PATIENT' } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, []);
});

test('patient requests persist, prevent duplicates, reach hospital staff, and return staff decisions', { skip: !process.env.TEST_MONGODB_URI }, async t => {
  // Only this newly generated database is written/deleted. Never use the app database.
  const dbName = `qcpt_${randomUUID().replaceAll('-', '')}`;
  const client = new MongoClient(process.env.TEST_MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);
  t.after(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });
  await ensurePriorityIndexes(db);
  await ensurePatientPriorityIndexes(db);
  const patientId = new ObjectId(), otherPatientId = new ObjectId(), staffId = new ObjectId(), otherStaffId = new ObjectId();
  const hospitalId = new ObjectId(), otherHospitalId = new ObjectId(), serviceId = new ObjectId(), sessionId = new ObjectId(), bookingId = new ObjectId();
  await db.collection('users').insertMany([
    { _id: patientId, role: 'PATIENT', status: 'ACTIVE', fullName: 'Test Patient' },
    { _id: otherPatientId, role: 'PATIENT', status: 'ACTIVE' },
    { _id: staffId, role: 'RECEPTION', status: 'ACTIVE', hospitalId },
    { _id: otherStaffId, role: 'RECEPTION', status: 'ACTIVE', hospitalId: otherHospitalId },
  ]);
  await db.collection('hospitals').insertOne({ _id: hospitalId, name: 'Test Hospital' });
  await db.collection('opdServices').insertOne({ _id: serviceId, name: 'General OPD', hospitalId });
  await db.collection('opdSessions').insertOne({ _id: sessionId, hospitalId, serviceId, sessionDate: new Date('2099-01-01T00:00:00Z'), startTime: '08:00', endTime: '10:00', status: 'OPEN' });
  await db.collection('bookings').insertOne({ _id: bookingId, patientId, sessionId, status: 'CONFIRMED', bookingCode: 'TEST-PRIORITY' });
  const config = readAuthConfig({ JWT_SECRET: 'priority-test-secret-'.repeat(4) });
  const base = await startHttp(t, createApp({
    authenticate: authenticate(db, config),
    patientPriorityRepository: createPatientPriorityRepository(db),
    priorityRepository: createPriorityRepository(db),
  }));
  async function headers(id) {
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(id.toString()).setIssuer(config.issuer).setAudience(config.audience).setIssuedAt().setExpirationTime('1h').sign(config.key);
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }
  const patientHeaders = await headers(patientId), staffHeaders = await headers(staffId);
  const path = `${base}/api/v1/bookings/${bookingId}/priority-requests`;
  async function submit(authHeaders = patientHeaders) { return fetch(path, { method: 'POST', headers: authHeaders, body: JSON.stringify({ reason: 'MOBILITY', note: 'Walking assistance' }) }); }
  assert.equal((await submit(await headers(otherPatientId))).status, 404);
  const responses = await Promise.all([submit(), submit()]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  const { data: created } = await responses.find(r => r.status === 201).json();
  assert.equal(created.status, 'PENDING');
  const stored = await db.collection('priorityRequests').findOne({ _id: new ObjectId(created._id) });
  assert.ok(stored.patientId.equals(patientId));
  assert.ok(stored.bookingId.equals(bookingId));
  assert.equal(stored.note, 'Walking assistance');
  const staffList = await fetch(`${base}/api/v1/staff/priority-requests?status=pending`, { headers: staffHeaders });
  assert.equal(staffList.status, 200);
  const staffData = await staffList.json();
  assert.equal(staffData.data[0]._id, created._id);
  assert.equal(staffData.data[0].patient.fullName, 'Test Patient');
  const otherList = await fetch(`${base}/api/v1/staff/priority-requests?status=pending`, { headers: await headers(otherStaffId) });
  assert.deepEqual((await otherList.json()).data, []);
  const decision = await fetch(`${base}/api/v1/staff/priority-requests/${created._id}/decision`, { method: 'PATCH', headers: staffHeaders, body: JSON.stringify({ decision: 'ACCEPTED', decisionNote: 'Assistance approved' }) });
  assert.equal(decision.status, 200);
  const patientList = await fetch(`${base}/api/v1/priority-requests/me`, { headers: patientHeaders });
  assert.equal(patientList.status, 200);
  assert.equal((await patientList.json()).data[0].decisionNote, 'Assistance approved');
  assert.equal((await submit()).status, 409);
  const privateList = await fetch(`${base}/api/v1/priority-requests/me`, { headers: await headers(otherPatientId) });
  assert.deepEqual((await privateList.json()).data, []);
  await db.collection('bookings').updateOne({ _id: bookingId }, { $set: { status: 'CANCELLED' } });
  assert.equal((await submit()).status, 409);
  assert.equal(await db.collection('priorityRequests').countDocuments(), 1);
});
