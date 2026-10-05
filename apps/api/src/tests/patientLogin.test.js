import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { jwtVerify } from 'jose';
import { createApp } from '../app.js';
import { registerPatient } from '../modules/auth/patientRegistration.js';
import { readAuthConfig } from '../config/auth.js';
import { startHttp } from './testServer.js';

test('patient login checks password and status, activates legacy pending patients, and signs valid JWTs', async (t) => {
  let user;
  const repository = {
    insert: async (value) => { user = { ...value, _id: new ObjectId() }; },
    findByNic: async (nic) => user.nic === nic ? user : null,
    activatePending: async () => { user.status = 'ACTIVE'; return user; },
  };
  const authConfig = readAuthConfig({ JWT_SECRET: 'a'.repeat(64) });
  await registerPatient(repository, { fullName: 'Test Patient', nic: '123456789V', mobile: '0771234567', password: 'Password123' });
  const base = await startHttp(t, createApp({ patientRegistrationRepository: repository, authConfig }));
  async function login(body = { nic: '123456789v', password: 'Password123' }) {
    return fetch(`${base}/api/v1/auth/patient/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  assert.equal((await login({ nic: user.nic, password: 'wrong' })).status, 401);
  assert.equal((await login({ nic: '200012345678', password: 'Password123' })).status, 401);
  assert.equal((await login({ nic: user.nic, password: 'Password123', role: 'NURSE' })).status, 400);
  const response = await login();
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.patient.fullName, 'Test Patient');
  assert.equal(data.userId, user._id.toString());
  assert.equal(data.passwordHash, undefined);
  const { payload } = await jwtVerify(data.accessToken, authConfig.key, { issuer: authConfig.issuer, audience: authConfig.audience, algorithms: ['HS256'] });
  assert.equal(payload.sub, user._id.toString());
  assert.equal(payload.exp - payload.iat, 86400);
  user.status = 'SUSPENDED';
  assert.equal((await login()).status, 403);
  user.status = 'PENDING_VERIFICATION';
  assert.equal((await login({ nic: user.nic, password: 'wrong' })).status, 401);
  assert.equal(user.status, 'PENDING_VERIFICATION');
  assert.equal((await login()).status, 200);
  assert.equal(user.status, 'ACTIVE');
});
