import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { createApp } from '../app.js';
import {
  createHospitalRepository,
  ensureHospitalIndexes,
} from '../modules/hospitals/hospitalRepository.js';
import { parseHospitalId } from '../modules/hospitals/hospitalId.js';
import { demoHospitals, seedHospitals } from '../seeds/hospitals.js';
import { demoServices, seedServices } from '../seeds/services.js';
import { startHttp, startMongo } from './testServer.js';

const id = (number) => new ObjectId(number.toString(16).padStart(24, '0'));

test('hospital IDs accept only full hexadecimal ObjectId strings', () => {
  const value = 'abcdef000000000000000001';
  assert.equal(parseHospitalId(value.toUpperCase()).toString(), value);
  for (const invalid of [
    undefined,
    null,
    {},
    123,
    '',
    'abcdefghijkl',
    'g'.repeat(24),
    '1'.repeat(23),
    '1'.repeat(25),
    ` ${value}`,
  ]) {
    assert.throws(
      () => parseHospitalId(invalid),
      (error) => error.status === 400 && Boolean(error.fieldErrors.hospitalId)
    );
  }
});

test(
  'hospital details and services over HTTP with real MongoDB',
  { timeout: 40000 },
  async (t) => {
    const { db } = await startMongo(t);
    await ensureHospitalIndexes(db);
    await ensureHospitalIndexes(db);
    const active = new ObjectId('abcdef000000000000000001');
    const empty = id(2);
    const inactive = id(3);
    const unpublished = id(4);
    const missing = id(5);
    await db.collection('hospitals').insertMany([
      {
        _id: active,
        name: 'Test Hospital',
        city: 'Colombo',
        address: 'Test address',
        phone: 'Test phone',
        imageUrl: 'https://example.com/hospital.jpg',
        imagePublicId: 'private-image-id',
        internalNotes: 'private-notes',
        isActive: true,
      },
      {
        _id: empty,
        name: 'Empty Hospital',
        city: 'Kandy',
        address: 'Test address',
        isActive: true,
      },
      {
        _id: inactive,
        name: 'Inactive Hospital',
        city: 'Kandy',
        address: 'Test address',
        isActive: false,
      },
      {
        _id: unpublished,
        name: 'Unpublished Hospital',
        city: 'Kandy',
        address: 'Test address',
      },
    ]);
    await db.collection('opdServices').insertMany([
      {
        _id: id(11),
        hospitalId: active,
        name: 'Zebra clinic',
        isActive: true,
        internalNotes: 'private-notes',
      },
      { _id: id(12), hospitalId: active, name: 'Alpha clinic', isActive: true },
      { _id: id(13), hospitalId: active, name: 'alpha clinic', isActive: true },
      {
        _id: id(14),
        hospitalId: active,
        name: 'Inactive clinic',
        isActive: false,
      },
      { _id: id(15), hospitalId: active, name: 'Unpublished clinic' },
      {
        _id: id(16),
        hospitalId: inactive,
        name: 'Hidden parent clinic',
        isActive: true,
      },
      {
        _id: id(17),
        hospitalId: missing,
        name: 'Orphan clinic',
        isActive: true,
      },
      {
        _id: id(18),
        hospitalId: active.toString(),
        name: 'Wrong reference type',
        isActive: true,
      },
    ]);
    const base = await startHttp(
      t,
      createApp({
        hospitalRepository: createHospitalRepository(db),
        checkDatabase: () => db.command({ ping: 1 }),
      })
    );
    async function get(path) {
      const response = await fetch(`${base}/api/v1/hospitals/${path}`);
      return { status: response.status, body: await response.json() };
    }
    await t.test(
      'returns public details without credentials, including optional contact fields',
      async () => {
        assert.deepEqual(await get(active.toString().toUpperCase()), {
          status: 200,
          body: {
            success: true,
            data: {
              _id: active.toString(),
              name: 'Test Hospital',
              city: 'Colombo',
              address: 'Test address',
              phone: 'Test phone',
              imageUrl: 'https://example.com/hospital.jpg',
            },
          },
        });
        const { body } = await get(empty.toString());
        assert.equal('phone' in body.data, false);
        assert.equal('imageUrl' in body.data, false);
      }
    );
    await t.test(
      'services are active, scoped to the selected hospital, projected and stably sorted',
      async () => {
        const { status, body } = await get(`${active}/services`);
        assert.equal(status, 200);
        assert.deepEqual(body, {
          success: true,
          data: [
            {
              _id: id(12).toString(),
              hospitalId: active.toString(),
              name: 'Alpha clinic',
            },
            {
              _id: id(13).toString(),
              hospitalId: active.toString(),
              name: 'alpha clinic',
            },
            {
              _id: id(11).toString(),
              hospitalId: active.toString(),
              name: 'Zebra clinic',
            },
          ],
          meta: { total: 3 },
        });
        const index = (await db.collection('opdServices').indexes()).find(
          (item) => item.name === 'service_hospital_active_name'
        );
        assert.deepEqual(index.key, {
          hospitalId: 1,
          isActive: 1,
          name: 1,
          _id: 1,
        });
      }
    );
    await t.test(
      'active hospital with no services returns a successful empty list',
      async () => {
        assert.deepEqual(await get(`${empty}/services`), {
          status: 200,
          body: { success: true, data: [], meta: { total: 0 } },
        });
        await db
          .collection('opdServices')
          .updateMany({ hospitalId: active }, { $set: { isActive: false } });
        assert.deepEqual((await get(`${active}/services`)).body.data, []);
        // Restore only the three published fixtures for subsequent checks.
        await db
          .collection('opdServices')
          .updateMany(
            { _id: { $in: [id(11), id(12), id(13)] } },
            { $set: { isActive: true } }
          );
      }
    );
    await t.test(
      'missing, inactive and unpublished hospitals are indistinguishable on both routes',
      async () => {
        for (const hospitalId of [inactive, unpublished, missing]) {
          for (const suffix of ['', '/services']) {
            const result = await get(`${hospitalId}${suffix}`);
            assert.deepEqual(result, {
              status: 404,
              body: {
                success: false,
                error: {
                  code: 'NOT_FOUND',
                  message: 'Hospital not found.',
                  fieldErrors: {},
                },
              },
            });
          }
        }
      }
    );
    await t.test(
      'invalid IDs and unsupported query parameters get safe validation errors',
      async () => {
        for (const suffix of ['', '/services']) {
          for (const value of [
            'invalid-id',
            'g'.repeat(24),
            '%7B%22%24ne%22%3Anull%7D',
            '%20' + active,
          ]) {
            const result = await get(value + suffix);
            assert.equal(result.status, 400);
            assert.equal(result.body.error.code, 'VALIDATION_ERROR');
            assert.ok(result.body.error.fieldErrors.hospitalId);
          }
          for (const query of [
            'isActive=false',
            'page=1',
            '__proto__=x',
            'search=a&search=b',
          ]) {
            const result = await get(`${active}${suffix}?${query}`);
            assert.equal(result.status, 400);
            assert.ok(Object.keys(result.body.error.fieldErrors).length);
          }
        }
      }
    );
    await t.test(
      'deactivating a hospital hides its existing details and services',
      async () => {
        await db
          .collection('hospitals')
          .updateOne({ _id: active }, { $set: { isActive: false } });
        assert.equal((await get(active.toString())).status, 404);
        assert.equal((await get(`${active}/services`)).status, 404);
      }
    );
    await t.test(
      'service seeds require active demo parents and preserve existing services and edits',
      async () => {
        assert.equal((await seedServices(db)).upsertedCount, 0);
        await seedHospitals(db);
        await db
          .collection('hospitals')
          .updateOne(
            { _id: demoHospitals[0]._id },
            { $set: { isActive: false } }
          );
        assert.equal((await seedServices(db)).upsertedCount, 4);
        await db
          .collection('hospitals')
          .updateOne(
            { _id: demoHospitals[0]._id },
            { $set: { isActive: true } }
          );
        assert.equal((await seedServices(db)).upsertedCount, 2);
        await db
          .collection('opdServices')
          .updateOne(
            { _id: demoServices[0]._id },
            { $set: { name: 'Edited demo service', isActive: false } }
          );
        assert.equal((await seedServices(db)).upsertedCount, 0);
        assert.equal(await db.collection('opdServices').countDocuments({}), 14);
        const edited = await db
          .collection('opdServices')
          .findOne({ _id: demoServices[0]._id });
        assert.equal(edited.name, 'Edited demo service');
        assert.equal(edited.isActive, false);
        assert.equal(
          (await db.collection('opdServices').findOne({ _id: id(12) })).name,
          'Alpha clinic'
        );
        assert.equal(
          (await get(`${demoHospitals[0]._id}/services`)).body.meta.total,
          1
        );
      }
    );
  }
);

test('details/services database failures are 500 errors, not missing hospitals or empty lists', async (t) => {
  const failure = async () => {
    throw new Error('mongodb://private-user:private-password@private-host');
  };
  const base = await startHttp(
    t,
    createApp({
      hospitalRepository: { getDetails: failure, getServices: failure },
      checkDatabase: async () => {},
    })
  );
  for (const suffix of ['', '/services']) {
    const response = await fetch(`${base}/api/v1/hospitals/${id(1)}${suffix}`);
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(body).includes('private-'), false);
    assert.equal('data' in body, false);
  }
});
