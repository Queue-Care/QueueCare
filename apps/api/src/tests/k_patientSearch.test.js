import assert from 'node:assert/strict';
import { test } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import express from 'express';
import { ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { readAuthConfig } from '../config/auth.js';
import { authenticate } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { createStaffPatientSearchRepository } from '../modules/staff/k_patientSearchRepository.js';
import { staffPatientSearchRoutes } from '../modules/staff/k_patientSearchRoutes.js';
import { ensureBookingIndexes } from '../modules/bookings/bookingRepository.js';
import { startHttp, startMongo } from './testServer.js';

const id = n => new ObjectId(n.toString(16).padStart(24, '0'));
const config = readAuthConfig({ JWT_SECRET: 'patient-search-test-secret-'.repeat(3) });

test('M3-12 patient search with real MongoDB and JWT', { timeout: 60000 }, async t => {
  const spawn = childProcess.spawn;
  const mock = process.platform === 'win32' ? t.mock.method(childProcess, 'spawn',
    (command, args, options) => spawn(command, args.filter(arg => arg !== '--nounixsocket'),
      { ...options, windowsHide: true })) : null;
  if (mock) syncBuiltinESMExports();
  let db;
  try { ({ db } = await startMongo(t)); }
  finally { if (mock) { mock.mock.restore(); syncBuiltinESMExports(); } }
  const hospitalId = id(1), other = id(2);
  await db.collection('hospitals').insertMany([
    { _id: hospitalId, isActive: true }, { _id: other, isActive: true }, { _id: id(3), isActive: false },
  ]);
  const staff = (n, role, fields = {}) => ({ _id: id(n), role, status: 'ACTIVE', hospitalId, ...fields });
  await db.collection('users').insertMany([
    staff(11, 'RECEPTION'), staff(12, 'NURSE'), staff(13, 'ADMIN'), staff(14, 'PATIENT'),
    staff(15, 'DOCTOR'), staff(16, 'UNKNOWN'), staff(17, 'RECEPTION', { status: 'SUSPENDED' }),
    staff(18, 'RECEPTION', { hospitalId: null }), staff(19, 'RECEPTION', { hospitalId: hospitalId.toString() }),
    staff(20, 'RECEPTION', { hospitalId: id(999) }), staff(21, 'RECEPTION', { hospitalId: id(3) }),
    staff(22, 'RECEPTION', { hospitalId: other }), staff(23, 'RECEPTION', { hospitalId: undefined }),
  ]);
  await db.collection('opdSessions').insertMany([
    { _id: id(101), hospitalId }, { _id: id(102), hospitalId: other },
    { _id: id(103), hospitalId }, { _id: id(104), hospitalId: [hospitalId] },
  ]);
  const patient = (n, fullName, fields = {}) => ({ _id: id(n), role: 'PATIENT', status: 'ACTIVE', fullName, ...fields });
  await db.collection('users').insertMany([
    patient(201, 'Alice Perera', { nic: '123456789V', passwordHash: 'secret', passwordSalt: 'salt', mobile: '+94770000000',
      email: 'private@example.org', verificationId: 'secret-id', bookingRevision: 9, profileImageUrl: 'private', jwt: 'private' }),
    patient(202, 'Alice Other', { nic: '200012345678' }), patient(203, 'Alice Shared'),
    patient(204, 'Alice Unbooked'), patient(205, 'Alice Dangling'),
    patient(206, 'Literal [ab].* Patient', { nic: '123456780X' }),
    patient(207, 'Alice Inactive', { status: 'SUSPENDED' }), patient(208, 'Alice Staff', { role: 'NURSE' }),
    patient(209, ['Alice Broken']), patient(210, 'Alice Bad NIC', { nic: ['123456789V'] }),
    patient(211, 'Alice Array Reference'), patient(212, 'Alice Array Hospital'),
    patient(213, 'Alice Bad NIC', { nic: 'invalid' }),
  ]);
  let bookingId = 1000;
  const book = (patientId, sessionId) => ({ _id: id(bookingId++), bookingCode: `TEST-${bookingId}`,
    patientId, sessionId, status: 'CONFIRMED' });
  await db.collection('bookings').insertMany([
    book(id(201), id(101)), book(id(201), id(103)), book(id(202), id(102)),
    book(id(203), id(101)), book(id(203), id(102)), book(id(205), id(999)), book(id(999), id(101)),
    book(id(206), id(101)), book(id(207), id(101)), book(id(208), id(101)), book(id(209), id(101)),
    book(id(210), id(101)), book([id(211)], id(101)), book(id(212), id(104)), book(id(213), id(101)),
  ]);
  // Existing production booking index, not a new search index.
  await ensureBookingIndexes(db);
  const app = express();
  app.set('query parser', 'simple');
  app.use('/api/v1/staff/patients', staffPatientSearchRoutes(createStaffPatientSearchRepository(db), authenticate(db, config)));
  app.use(errorHandler);
  const base = await startHttp(t, app);
  const tokens = new Map();
  async function search(query = 'q=Alice', user = 11) {
    if (user !== null && !tokens.has(user)) tokens.set(user, await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(id(user).toString())
      .setIssuer(config.issuer).setAudience(config.audience).setIssuedAt().setExpirationTime('1h').sign(config.key));
    const response = await fetch(`${base}/api/v1/staff/patients/search?${query}`, {
      headers: user === null ? {} : { Authorization: `Bearer ${tokens.get(user)}` },
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }
  await t.test('unauthenticated rejected', async () => assert.equal((await search('q=Alice', null)).status, 401));
  for (const [user, role] of [[11, 'RECEPTION'], [12, 'NURSE'], [13, 'ADMIN']])
    await t.test(`${role} allowed`, async () => assert.equal((await search('q=Alice', user)).status, 200));
  for (const [user, description] of [[14, 'PATIENT'], [15, 'DOCTOR'], [16, 'UNKNOWN'], [17, 'inactive staff'],
    [18, 'null hospital'], [19, 'malformed hospital'], [20, 'dangling hospital'], [21, 'inactive hospital'], [23, 'missing hospital']])
    await t.test(`${description} rejected`, async () => assert.equal((await search('q=Alice', user)).status, 403));
  for (const query of ['', 'q=', 'q=%20%20', `q=${'a'.repeat(121)}`, 'q=a&q=b', 'q=a&hospitalId=2',
    'q=a&limit=100', 'q=%00a', 'q=a%0A', 'q[x]=a'])
    await t.test(`invalid query ${query.slice(0, 30)}`, async () => {
      const result = await search(query);
      assert.equal(result.status, 400); assert.equal(result.body.success, false);
      assert.equal(result.body.error.code, 'VALIDATION_ERROR'); assert.ok(result.body.error.fieldErrors);
    });
  await t.test('exact NIC and lowercase suffix; partial NIC does not match', async () => {
    for (const q of ['123456789V', '123456789v', ' 123456789v '])
      assert.deepEqual((await search(`q=${encodeURIComponent(q)}`)).body.data.map(p => p.patientId), [id(201).toString()]);
    assert.deepEqual((await search('q=123456789')).body.data, []);
  });
  await t.test('exact ObjectId including uppercase', async () => {
    assert.deepEqual((await search(`q=${id(201).toString().toUpperCase()}`)).body.data.map(p => p.patientId), [id(201).toString()]);
    assert.deepEqual((await search(`q=${id(201).toString().slice(1)}`)).body.data, []);
  });
  await t.test('lowercase X and 12-digit NIC; maximum query length accepted', async () => {
    assert.deepEqual((await search('q=123456780x')).body.data.map(p => p.patientId), [id(206).toString()]);
    assert.deepEqual((await search('q=200012345678', 22)).body.data.map(p => p.patientId), [id(202).toString()]);
    assert.equal((await search(`q=${'a'.repeat(120)}`)).status, 200);
  });
  await t.test('case-insensitive partial name and one-character query', async () => {
    assert.deepEqual((await search('q=LiCe')).body.data.map(p => p.fullName), ['Alice Perera', 'Alice Shared']);
    assert.equal((await search('q=A')).status, 200);
  });
  await t.test('phone and email are not search fields', async () => {
    assert.deepEqual((await search('q=%2B94770000000')).body.data, []);
    assert.deepEqual((await search('q=private%40example.org')).body.data, []);
  });
  await t.test('regex input is literal', async () => {
    assert.deepEqual((await search(`q=${encodeURIComponent('[ab].*')}`)).body.data.map(p => p.fullName), ['Literal [ab].* Patient']);
    assert.deepEqual((await search(`q=${encodeURIComponent('.*')}`)).body.data.map(p => p.fullName), ['Literal [ab].* Patient']);
  });
  await t.test('hospital isolation, shared patients, unbooked/dangling exclusion and deduplication', async () => {
    assert.deepEqual((await search()).body.data.map(p => p.patientId), [id(201).toString(), id(203).toString()]);
    assert.deepEqual((await search('q=Alice', 22)).body.data.map(p => p.patientId), [id(202).toString(), id(203).toString()]);
  });
  await t.test('minimal fields, masking, credential-free patients and no-store envelope', async () => {
    const result = await search();
    assert.equal(result.cache, 'no-store'); assert.equal(result.body.success, true);
    assert.deepEqual(Object.keys(result.body).sort(), ['data', 'success']);
    for (const p of result.body.data) assert.deepEqual(Object.keys(p).sort(), ['fullName', 'maskedNic', 'patientId']);
    assert.equal(result.body.data[0].maskedNic, '········789V');
    assert.equal(result.body.data[1].maskedNic, null);
    assert.ok(!JSON.stringify(result.body).includes('123456789V'));
  });
  await t.test('zero matches is a successful empty array', async () => {
    const result = await search('q=Nobody');
    assert.equal(result.status, 200); assert.deepEqual(result.body, { success: true, data: [] });
  });
  await t.test('malformed records filtered before deterministic maximum 20 valid results', async () => {
    const users = [], bookings = [];
    for (let i = 0; i < 25; i++) {
      users.push(patient(300 + i, `Limit ${String(i).padStart(2, '0')}`));
      bookings.push(book(id(300 + i), id(101)));
    }
    for (const [i, fields] of [{ fullName: ['Limit 00'] }, { fullName: 'Limit \nInvalid' },
      { fullName: 'Limit ' + 'a'.repeat(120) }, { nic: {} }, { nic: ['200012345678'] }].entries()) {
      users.push(patient(400 + i, 'Limit !Invalid', fields)); bookings.push(book(id(400 + i), id(101)));
    }
    users.push({ ...patient(450, 'Limit !Bad ID'), _id: 'bad-id' }); bookings.push(book('bad-id', id(101)));
    await db.collection('users').insertMany(users); await db.collection('bookings').insertMany(bookings);
    const first = (await search('q=Limit')).body.data;
    assert.equal(first.length, 20);
    assert.deepEqual(first.map(p => p.patientId), Array.from({ length: 20 }, (_, i) => id(300 + i).toString()));
    assert.deepEqual((await search('q=Limit')).body.data, first);
  });
});
