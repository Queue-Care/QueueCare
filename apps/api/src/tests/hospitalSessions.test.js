import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { createApp } from '../app.js';
import {
  createHospitalRepository,
  ensureHospitalIndexes,
} from '../modules/hospitals/hospitalRepository.js';
import {
  colomboDate,
  parseSessionQuery,
} from '../modules/hospitals/sessionQuery.js';
import { seedHospitals, demoHospitals } from '../seeds/hospitals.js';
import { seedServices, demoServices } from '../seeds/services.js';
import { seedSessions, tomorrowInColombo } from '../seeds/sessions.js';
import { startHttp, startMongo } from './testServer.js';

const id = (n) => new ObjectId(n.toString(16).padStart(24, '0'));
test('session date defaults use Sri Lanka midnight, including month and year boundaries', () => {
  assert.equal(colomboDate(new Date('2026-10-01T18:29:59Z')), '2026-10-01');
  assert.equal(colomboDate(new Date('2026-10-01T18:30:00Z')), '2026-10-02');
  assert.equal(colomboDate(new Date('2026-12-31T18:30:00Z')), '2027-01-01');
  assert.equal(
    tomorrowInColombo(new Date('2026-10-31T12:00:00Z')),
    '2026-11-01'
  );
  assert.equal(
    tomorrowInColombo(new Date('2026-12-31T12:00:00Z')),
    '2027-01-01'
  );
});
test('validates real calendar dates and strict, single service IDs', () => {
  assert.deepEqual(parseSessionQuery({}), {
    date: undefined,
    serviceId: undefined,
  });
  assert.equal(
    parseSessionQuery({
      date: '2028-02-29',
      serviceId: 'ABCDEF000000000000000001',
    }).serviceId.toString(),
    'abcdef000000000000000001'
  );
  for (const query of [
    { date: '2026-02-29' },
    { date: '2026-04-31' },
    { date: '2026-13-01' },
    { date: '2026-2-01' },
    { date: '2026-10-02T00:00:00Z' },
    { date: '' },
    { date: ['2026-10-02', '2026-10-03'] },
    { serviceId: '' },
    { serviceId: 'g'.repeat(24) },
    { serviceId: { $ne: null } },
    { serviceId: ['abcdef000000000000000001'] },
    { status: 'CLOSED' },
    { ['__proto__']: 'x' },
  ])
    assert.throws(
      () => parseSessionQuery(query),
      (error) =>
        error.status === 400 && Object.keys(error.fieldErrors).length > 0
    );
});

test(
  'available sessions API with real MongoDB and controlled clock',
  { timeout: 40000 },
  async (t) => {
    const { db } = await startMongo(t);
    await ensureHospitalIndexes(db);
    await ensureHospitalIndexes(db);
    const hospitalId = id(1),
      otherHospital = id(2),
      hiddenHospital = id(3),
      emptyHospital = id(4);
    const serviceId = id(11),
      secondService = id(12),
      hiddenService = id(13),
      otherService = id(14),
      emptyService = id(15);
    await db.collection('hospitals').insertMany([
      { _id: hospitalId, name: 'Test Hospital', isActive: true },
      { _id: otherHospital, name: 'Other Hospital', isActive: true },
      { _id: hiddenHospital, name: 'Hidden Hospital', isActive: false },
      { _id: emptyHospital, name: 'Empty Hospital', isActive: true },
    ]);
    await db.collection('opdServices').insertMany([
      { _id: serviceId, hospitalId, name: 'General OPD', isActive: true },
      {
        _id: secondService,
        hospitalId,
        name: 'Medical clinic',
        isActive: true,
      },
      {
        _id: hiddenService,
        hospitalId,
        name: 'Hidden clinic',
        isActive: false,
      },
      {
        _id: otherService,
        hospitalId: otherHospital,
        name: 'Other clinic',
        isActive: true,
      },
      { _id: emptyService, hospitalId, name: 'Empty clinic', isActive: true },
    ]);
    let now = new Date('2026-10-02T03:00:00Z'); // 08:30 in Sri Lanka.
    const base = await startHttp(
      t,
      createApp({
        hospitalRepository: createHospitalRepository(db, { now: () => now }),
        checkDatabase: () => db.command({ ping: 1 }),
      })
    );
    const collection = db.collection('opdSessions');
    const session = (n, overrides = {}) => ({
      _id: id(n),
      hospitalId,
      serviceId,
      doctorOrTeam: 'Test OPD team',
      sessionDate: new Date('2026-10-02T00:00:00Z'),
      startTime: '09:00',
      endTime: '10:00',
      capacity: 20,
      bookedCount: 8,
      status: 'OPEN',
      createdById: id(999),
      internalNotes: 'private-notes',
      ...overrides,
    });
    await collection.insertMany([
      session(102),
      session(101),
      session(103, {
        serviceId: secondService,
        startTime: '11:00',
        endTime: '12:00',
        bookedCount: 20,
      }),
      session(104, { startTime: '12:00', endTime: '13:00', bookedCount: 25 }),
      session(110, { startTime: '08:00', endTime: '10:00' }),
      session(111, { startTime: '08:30' }),
      session(112, { status: 'CLOSED' }),
      session(113, { status: 'RUNNING' }),
      session(114, { status: 'COMPLETED' }),
      session(115, { status: 'CANCELLED' }),
      session(116, { serviceId: hiddenService }),
      session(117, { serviceId: otherService }),
      session(118, { serviceId: id(999) }),
      session(119, { hospitalId: otherHospital, serviceId: otherService }),
      session(120, { sessionDate: new Date('2026-10-03T00:00:00Z') }),
      session(121, { sessionDate: new Date('2026-10-01T00:00:00Z') }),
      ...[
        { capacity: -1 },
        { capacity: 0 },
        { capacity: 2.5 },
        { bookedCount: -1 },
        { bookedCount: '2' },
        { bookedCount: 1.5 },
        { startTime: '25:00' },
        { startTime: '09:75' },
        { startTime: ['09:00'] },
        { endTime: null },
        { endTime: '08:00' },
        { endTime: '09:00' },
        { doctorOrTeam: '' },
        { sessionDate: '2026-10-02' },
        { sessionDate: [new Date('2026-10-02T00:00:00Z')] },
        { status: ['OPEN'] },
      ].map((overrides, i) => session(200 + i, overrides)),
    ]);
    async function get(query = '', target = hospitalId.toString()) {
      const response = await fetch(
        `${base}/api/v1/hospitals/${target}/sessions${query}`
      );
      return { status: response.status, body: await response.json() };
    }
    await t.test(
      'returns future OPEN sessions in stable time/ID order with accurate capacity and public fields',
      async () => {
        const { status, body } = await get();
        assert.equal(status, 200);
        assert.equal(body.success, true);
        assert.deepEqual(body.meta, {
          date: '2026-10-02',
          timeZone: 'Asia/Colombo',
          total: 4,
          bookableCount: 2,
        });
        assert.deepEqual(
          body.data.map((item) => item._id),
          [101, 102, 103, 104].map((n) => id(n).toString())
        );
        assert.deepEqual(body.data[0], {
          _id: id(101).toString(),
          hospitalId: hospitalId.toString(),
          serviceId: serviceId.toString(),
          serviceName: 'General OPD',
          doctorOrTeam: 'Test OPD team',
          sessionDate: '2026-10-02',
          startTime: '09:00',
          endTime: '10:00',
          startsAt: '2026-10-02T03:30:00.000Z',
          endsAt: '2026-10-02T04:30:00.000Z',
          status: 'OPEN',
          capacity: 20,
          bookedCount: 8,
          remainingCapacity: 12,
          isBookable: true,
        });
        assert.deepEqual(
          body.data
            .slice(2)
            .map((item) => [item.remainingCapacity, item.isBookable]),
          [
            [0, false],
            [0, false],
          ]
        );
        assert.ok(!JSON.stringify(body).includes('private-notes'));
        assert.ok(!JSON.stringify(body).includes('createdById'));
        assert.ok(
          (await collection.indexes()).some(
            (index) => index.name === 'session_hospital_status_date_service'
          )
        );
      }
    );
    await t.test(
      'service and date filters isolate records; past dates and empty catalogs return honest emptiness',
      async () => {
        assert.deepEqual(
          (await get(`?serviceId=${secondService}`)).body.data.map(
            (item) => item._id
          ),
          [id(103).toString()]
        );
        assert.deepEqual(
          (await get(`?date=2026-10-03&serviceId=${serviceId}`)).body.data.map(
            (item) => item._id
          ),
          [id(120).toString()]
        );
        for (const query of [
          '?date=2026-10-01',
          '?date=2026-10-04',
          `?serviceId=${emptyService}`,
        ]) {
          const result = await get(query);
          assert.equal(result.status, 200);
          assert.deepEqual(result.body.data, []);
          assert.equal(result.body.meta.bookableCount, 0);
        }
        assert.deepEqual(
          (await get('', emptyHospital.toString())).body.data,
          []
        );
      }
    );
    await t.test(
      'cutoff is exclusive and default day changes at Colombo midnight',
      async () => {
        now = new Date('2026-10-02T03:30:00Z');
        assert.deepEqual(
          (await get()).body.data.map((item) => item._id),
          [103, 104].map((n) => id(n).toString())
        );
        now = new Date('2026-10-02T18:30:00Z');
        const result = await get();
        assert.equal(result.body.meta.date, '2026-10-03');
        assert.deepEqual(
          result.body.data.map((item) => item._id),
          [id(120).toString()]
        );
        now = new Date('2026-10-02T03:00:00Z');
      }
    );
    await t.test(
      'missing/inactive parents and out-of-hospital services are not exposed',
      async () => {
        for (const target of [hiddenHospital, id(999)])
          assert.equal((await get('', target.toString())).status, 404);
        for (const filter of [hiddenService, otherService, id(999)]) {
          const result = await get(`?serviceId=${filter}`);
          assert.equal(result.status, 404);
          assert.equal(result.body.error.code, 'NOT_FOUND');
        }
        await db
          .collection('opdServices')
          .updateOne({ _id: serviceId }, { $set: { isActive: false } });
        assert.deepEqual(
          (await get()).body.data.map((item) => item._id),
          [id(103).toString()]
        );
        await db
          .collection('hospitals')
          .updateOne({ _id: hospitalId }, { $set: { isActive: false } });
        assert.equal((await get()).status, 404);
        await db
          .collection('hospitals')
          .updateOne({ _id: hospitalId }, { $set: { isActive: true } });
        await db
          .collection('opdServices')
          .updateOne({ _id: serviceId }, { $set: { isActive: true } });
      }
    );
    await t.test(
      'HTTP filters reject invalid/duplicate/injected parameters and malformed hospital IDs',
      async () => {
        for (const query of [
          '?date=2026-02-29',
          '?date=2026-04-31',
          '?date=',
          '?date=2026-10-02&date=2026-10-03',
          '?serviceId=',
          '?serviceId[$ne]=x',
          '?status=CLOSED',
          '?__proto__=x',
          '?page=1',
          `?serviceId=${serviceId}&serviceId=${secondService}`,
        ]) {
          const result = await get(query);
          assert.equal(result.status, 400, query);
          assert.equal(result.body.error.code, 'VALIDATION_ERROR');
          assert.ok(Object.keys(result.body.error.fieldErrors).length);
        }
        assert.equal((await get('', 'invalid')).status, 400);
      }
    );
    await t.test(
      'remaining capacity is recalculated on each request without reserving a slot',
      async () => {
        await collection.updateOne(
          { _id: id(101) },
          { $set: { bookedCount: 19 } }
        );
        const result = await get(`?serviceId=${serviceId}`);
        assert.equal(result.body.data[0].remainingCapacity, 1);
        assert.equal(
          (await collection.findOne({ _id: id(101) })).bookedCount,
          19
        );
      }
    );
    await t.test(
      'demo sessions are date-stable, non-destructive, and require active demo parents/services',
      async () => {
        assert.equal(
          (await seedSessions(db, { date: '2026-10-03', now })).upsertedCount,
          0
        );
        await seedHospitals(db);
        await seedServices(db);
        const first = await seedSessions(db, { now });
        assert.deepEqual(first, { date: '2026-10-03', upsertedCount: 12 });
        const seeded = await collection.findOne({
          seedSource: 'queuecare-demo',
        });
        await collection.updateOne(
          { _id: seeded._id },
          { $set: { status: 'CANCELLED', bookedCount: 7 } }
        );
        assert.equal((await seedSessions(db, { now })).upsertedCount, 0);
        assert.equal(
          (await collection.findOne({ _id: seeded._id })).status,
          'CANCELLED'
        );
        assert.equal(
          (await collection.findOne({ _id: id(101) })).bookedCount,
          19
        );
        await db
          .collection('hospitals')
          .updateOne(
            { _id: demoHospitals[0]._id },
            { $set: { isActive: false } }
          );
        await db
          .collection('opdServices')
          .updateOne(
            { _id: demoServices[2]._id },
            { $set: { isActive: false } }
          );
        assert.equal(
          (await seedSessions(db, { now, date: '2026-10-04' })).upsertedCount,
          6
        );
        await assert.rejects(seedSessions(db, { date: '2026-02-29' }));
      }
    );
  }
);

test('session database failures stay safe errors rather than empty availability', async (t) => {
  const base = await startHttp(
    t,
    createApp({
      hospitalRepository: {
        async getSessions() {
          throw new Error(
            'mongodb://private-user:private-password@private-host'
          );
        },
      },
      checkDatabase: async () => {},
    })
  );
  const response = await fetch(`${base}/api/v1/hospitals/${id(1)}/sessions`);
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.equal('data' in body, false);
  assert.ok(!JSON.stringify(body).includes('private-'));
});
