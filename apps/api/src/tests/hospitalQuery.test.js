import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../config/env.js';
import {
  parseHospitalQuery,
  buildHospitalFilter,
} from '../modules/hospitals/hospitalQuery.js';

test('hospital query defaults and trimmed filters', () => {
  assert.deepEqual(parseHospitalQuery({}), {
    search: '',
    city: '',
    page: 1,
    limit: 20,
  });
  assert.deepEqual(
    parseHospitalQuery({
      search: ' Central ',
      city: ' Kandy ',
      page: '2',
      limit: '10',
    }),
    { search: 'Central', city: 'Kandy', page: 2, limit: 10 }
  );
});

test('rejects malformed, repeated, oversized, and unsupported filters', () => {
  for (const query of [
    { search: ['a', 'b'] },
    { city: { $ne: '' } },
    { search: 'x'.repeat(101) },
    { city: 'x'.repeat(81) },
    { search: 'a\nb' },
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: '1001' },
    { limit: '51' },
    { limit: '' },
    { page: '1e2' },
    { limit: ['2', '3'] },
    { isActive: 'false' },
    { ['__proto__']: 'invalid' },
  ]) {
    assert.throws(
      () => parseHospitalQuery(query),
      (error) =>
        error.status === 400 &&
        error.code === 'VALIDATION_ERROR' &&
        Object.keys(error.fieldErrors).length > 0
    );
  }
});

test('search is a literal substring and city is a literal exact match', () => {
  const filter = buildHospitalFilter({
    search: 'Clinic [West].*',
    city: 'Kandy (East)',
  });
  assert.equal(filter.isActive, true);
  const pattern = new RegExp(filter.$or[0].name.$regex, 'i');
  assert.equal(pattern.test('The clinic [west].* centre'), true);
  assert.equal(pattern.test('Clinic W anything'), false);
  const city = new RegExp(filter.city.$regex, 'i');
  assert.equal(city.test('kandy (east)'), true);
  assert.equal(city.test('Kandy (East) Annex'), false);
});

test('config supports local defaults and rejects unsafe settings without leaking them', () => {
  assert.deepEqual(readConfig({}), {
    port: 4000,
    host: '0.0.0.0',
    mongoUri: 'mongodb://127.0.0.1:27017/opd_queue',
    dbName: 'opd_queue',
  });
  for (const env of [
    { PORT: '0' },
    { PORT: '65536' },
    { PORT: 'abc' },
    { MONGODB_DB_NAME: 'a/b' },
  ]) {
    assert.throws(() => readConfig(env));
  }
  assert.throws(
    () => readConfig({ MONGODB_URI: 'secret-credential' }),
    (error) => !error.message.includes('secret-credential')
  );
});
