import test from 'node:test';
import assert from 'node:assert/strict';
import { scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { createApp } from '../app.js';
import { startHttp, startMongo } from './testServer.js';
import { createPatientRegistrationRepository, ensurePatientRegistrationIndexes } from '../modules/auth/patientRegistration.js';

const body = { fullName: ' Test Patient ', nic: '123456789v', mobile: '077 123 4567', email: ' TEST@example.com ', password: 'test password 123' };
const post = (base, values) => fetch(`${base}/api/v1/auth/patient/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
});

test('registration HTTP validates identity, hashes passwords, and creates an active account', async (t) => {
  const saved = [];
  const base = await startHttp(t, createApp({ patientRegistrationRepository: { insert: async (user) => saved.push(user) } }));
  const response = await post(base, body);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.deepEqual(result.data, { registered: true });
  const user = saved[0];
  assert.equal(user.fullName, 'Test Patient');
  assert.equal(user.nic, '123456789V');
  assert.equal(user.mobile, '+94771234567');
  assert.equal(user.email, 'test@example.com');
  assert.equal(user.role, 'PATIENT');
  assert.equal(user.status, 'ACTIVE');
  assert.equal(user.password, undefined);
  const [algorithm, salt, hash] = user.passwordHash.split('$');
  assert.equal(algorithm, 'scrypt');
  assert.equal((await promisify(scryptCallback)(body.password, salt, 64)).toString('hex'), hash);
  for (const invalid of [null, [], { ...body, role: 'NURSE' }, { ...body, nic: 'invalid' }, { ...body, password: 'short' }, { ...body, mobile: '123' }, { ...body, email: 42 }]) {
    assert.equal((await post(base, invalid)).status, 400);
  }
  assert.equal(saved.length, 1);
});

test('registration handles duplicates, database errors, and missing configuration safely', async (t) => {
  for (const [error, status] of [[{ code: 11000 }, 409], [new Error('private database credentials'), 500]]) {
    const base = await startHttp(t, createApp({ patientRegistrationRepository: { insert: async () => { throw error; } } }));
    const response = await post(base, body);
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /credentials|passwordHash|test password/);
  }
  const base = await startHttp(t, createApp({}));
  assert.equal((await post(base, body)).status, 503);
});

test('registration persists in isolated MongoDB and enforces normalized unique identities', async (t) => {
  const { db } = await startMongo(t);
  await ensurePatientRegistrationIndexes(db);
  const base = await startHttp(t, createApp({ patientRegistrationRepository: createPatientRegistrationRepository(db) }));
  assert.equal((await post(base, body)).status, 201);
  for (const duplicate of [
    { ...body, mobile: '0779876543', email: 'other@example.com' },
    { ...body, nic: '200012345678', mobile: '+94771234567', email: 'other@example.com' },
    { ...body, nic: '200012345678', mobile: '0779876543' },
  ]) assert.equal((await post(base, duplicate)).status, 409);
  assert.equal(await db.collection('users').countDocuments(), 1);
  const user = await db.collection('users').findOne({ nic: '123456789V' });
  assert.equal(user.status, 'ACTIVE');
  assert.equal(user.password, undefined);
});
