import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { createApp } from '../app.js';
import {
  createHospitalRepository,
  ensureHospitalIndexes,
} from '../modules/hospitals/hospitalRepository.js';
import { demoHospitals, seedHospitals } from '../seeds/hospitals.js';
import { startHttp, startMongo } from './testServer.js';

test(
  'hospital API with real MongoDB and HTTP',
  { timeout: 40000 },
  async (t) => {
    const { db } = await startMongo(t);
    await ensureHospitalIndexes(db);
    await ensureHospitalIndexes(db);
    const collection = db.collection('hospitals');
    const fixture = [
      ['Alpha Hospital', 'Colombo', true],
      ['alpha hospital', 'Kandy', true],
      ['Clinic [West]', 'Colombo', true],
      ['Zeta Hospital', 'Galle', true],
      ['Hidden Hospital', 'Colombo', false],
      ['Unpublished Hospital', 'Colombo'],
    ].map(([name, city, isActive], index) => ({
      _id: new ObjectId((index + 1).toString(16).padStart(24, '0')),
      name,
      city,
      ...(isActive === undefined ? {} : { isActive }),
      address: 'Test address',
      phone: 'Test phone',
      imageUrl: 'https://example.com/image.jpg',
      imagePublicId: 'private-asset-key',
      internalNotes: 'Do not expose',
    }));
    await collection.insertMany(fixture);
    const base = await startHttp(
      t,
      createApp({
        hospitalRepository: createHospitalRepository(db),
        checkDatabase: () => db.command({ ping: 1 }),
      })
    );
    async function get(path) {
      const response = await fetch(base + path);
      return { status: response.status, body: await response.json() };
    }

    await t.test('health and hospital indexes', async () => {
      assert.deepEqual(await get('/health'), {
        status: 200,
        body: { success: true, data: { status: 'ok', database: 'connected' } },
      });
      const indexes = await collection.indexes();
      assert.ok(indexes.some((index) => index.name === 'hospital_active_name'));
      assert.ok(
        indexes.some((index) => index.name === 'hospital_active_city_name')
      );
    });
    await t.test(
      'public browse returns active hospitals and public fields only',
      async () => {
        const { status, body } = await get('/api/v1/hospitals');
        assert.equal(status, 200);
        assert.equal(body.success, true);
        assert.equal(body.meta.total, 4);
        assert.deepEqual(
          body.data.map((item) => item._id),
          fixture.slice(0, 4).map((item) => item._id.toString())
        );
        assert.deepEqual(
          Object.keys(body.data[0]).sort(),
          ['_id', 'name', 'city', 'address', 'phone', 'imageUrl'].sort()
        );
      }
    );
    await t.test(
      'search matches name or city case-insensitively, with optional exact city filter',
      async () => {
        assert.equal(
          (await get('/api/v1/hospitals?search=ALPHA')).body.meta.total,
          2
        );
        assert.equal(
          (await get('/api/v1/hospitals?search=colombo')).body.meta.total,
          2
        );
        const result = await get(
          '/api/v1/hospitals?search=alpha&city=%20kandy%20'
        );
        assert.equal(result.body.meta.total, 1);
        assert.equal(result.body.data[0].city, 'Kandy');
        assert.equal(
          (await get('/api/v1/hospitals?city=Col')).body.meta.total,
          0
        );
      }
    );
    await t.test('regular expression characters stay literal', async () => {
      assert.equal(
        (await get('/api/v1/hospitals?search=%5BWest%5D')).body.meta.total,
        1
      );
      assert.equal(
        (await get('/api/v1/hospitals?search=.*')).body.meta.total,
        0
      );
      assert.equal((await get('/api/v1/hospitals?city=.*')).body.meta.total, 0);
    });
    await t.test('stable pagination and empty results', async () => {
      const first = (await get('/api/v1/hospitals?limit=2')).body;
      const second = (await get('/api/v1/hospitals?limit=2&page=2')).body;
      assert.deepEqual(first.meta, {
        page: 1,
        limit: 2,
        total: 4,
        totalPages: 2,
        hasNextPage: true,
      });
      assert.equal(second.meta.hasNextPage, false);
      assert.deepEqual(
        [...first.data, ...second.data].map((item) => item._id),
        fixture.slice(0, 4).map((item) => item._id.toString())
      );
      const empty = (await get('/api/v1/hospitals?search=absent')).body;
      assert.deepEqual(empty, {
        success: true,
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      });
      assert.deepEqual(
        (await get('/api/v1/hospitals?page=3&limit=2')).body.data,
        []
      );
    });
    await t.test(
      'invalid HTTP query parameters get standard validation errors',
      async () => {
        for (const query of [
          'page=0',
          'limit=51',
          'search=a&search=b',
          'city[$ne]=x',
          'isActive=false',
          '__proto__=x',
        ]) {
          const { status, body } = await get('/api/v1/hospitals?' + query);
          assert.equal(status, 400, query);
          assert.equal(body.success, false);
          assert.equal(body.error.code, 'VALIDATION_ERROR');
          assert.ok(Object.keys(body.error.fieldErrors).length > 0);
        }
        assert.equal((await get('/api/v1/does-not-exist')).status, 404);
      }
    );
    await t.test(
      'explicit demo seed is idempotent and preserves existing data and edits',
      async () => {
        assert.equal((await seedHospitals(db)).upsertedCount, 3);
        assert.equal(
          (await collection.findOne({ _id: demoHospitals[0]._id }))
            .openingHours,
          demoHospitals[0].openingHours
        );
        await collection.updateOne(
          { _id: demoHospitals[0]._id },
          {
            $set: {
              name: 'Edited demo name',
              openingHours: 'Edited demo hours',
            },
          }
        );
        assert.equal((await seedHospitals(db)).upsertedCount, 0);
        assert.equal(await collection.countDocuments({}), fixture.length + 3);
        assert.equal(
          (await collection.findOne({ _id: demoHospitals[0]._id }))
            .openingHours,
          'Edited demo hours'
        );
        assert.equal(
          (await collection.findOne({ _id: demoHospitals[0]._id })).name,
          'Edited demo name'
        );
        assert.equal(
          (await collection.findOne({ _id: fixture[0]._id })).name,
          'Alpha Hospital'
        );
      }
    );
  }
);

test('database errors return safe failures instead of successful empty data', async (t) => {
  const secret = 'mongodb://private-user:private-password@private-host';
  const base = await startHttp(
    t,
    createApp({
      hospitalRepository: {
        async search() {
          throw new Error(secret);
        },
      },
      async checkDatabase() {
        throw new Error(secret);
      },
    })
  );
  for (const [path, expectedStatus, code] of [
    ['/api/v1/hospitals', 500, 'INTERNAL_ERROR'],
    ['/health', 503, 'SERVICE_UNAVAILABLE'],
  ]) {
    const response = await fetch(base + path);
    const body = await response.json();
    assert.equal(response.status, expectedStatus);
    assert.equal(body.success, false);
    assert.equal(body.error.code, code);
    assert.equal(JSON.stringify(body).includes('private-'), false);
    assert.equal('data' in body, false);
  }
  const invalidJson = await fetch(base + '/api/v1/hospitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{broken',
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, 'VALIDATION_ERROR');
});
