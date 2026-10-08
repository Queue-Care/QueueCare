import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectSetup } from '../config/checkSetup.js';

const api =
  'MONGODB_URI=mongodb://127.0.0.1:27017/test\nJWT_SECRET=test-only-not-a-real-secret-with-enough-bytes\n';
const mobile = 'EXPO_PUBLIC_API_BASE_URL=http://192.0.2.1:4000/api/v1\n';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'queuecare-setup-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const app of ['api', 'mobile'])
    mkdirSync(join(root, 'apps', app), { recursive: true });
  return {
    root,
    write(app, text) {
      writeFileSync(join(root, 'apps', app, '.env'), text);
    },
  };
}

test('setup reports the missing files that prevented patient sign-in', (t) => {
  const f = fixture(t);
  const checks = inspectSetup(f.root);
  assert.equal(checks.filter((check) => check.status === 'FAIL').length, 2);
  assert.ok(
    checks.some((check) =>
      check.message.includes('apps/mobile/.env is missing')
    )
  );
  f.write('api', 'MONGODB_URI=mongodb://127.0.0.1/test\n');
  assert.ok(
    inspectSetup(f.root).some(
      (check) => check.status === 'FAIL' && check.message.includes('JWT_SECRET')
    )
  );
});

test('valid base files pass without mutation; absent media keys are only a warning', (t) => {
  const f = fixture(t);
  f.write('api', api);
  f.write('mobile', mobile);
  const environment = { ...process.env };
  const checks = inspectSetup(f.root);
  assert.equal(
    checks.some((check) => check.status === 'FAIL'),
    false
  );
  assert.ok(
    checks.some(
      (check) =>
        check.status === 'WARN' &&
        check.message.includes('saves photos in apps/api/profile_photo')
    )
  );
  assert.equal(readFileSync(join(f.root, 'apps/api/.env'), 'utf8'), api);
  assert.equal(readFileSync(join(f.root, 'apps/mobile/.env'), 'utf8'), mobile);
  assert.deepEqual({ ...process.env }, environment);
});

test('mobile check rejects missing, placeholder, loopback and malformed base URLs', (t) => {
  const f = fixture(t);
  f.write('api', api);
  for (const url of [
    '',
    'http://YOUR_LAPTOP_IP:4000/api/v1',
    'http://localhost:4000/api/v1',
    'http://127.0.0.1/api/v1',
    'http://[::1]/api/v1',
    'http://0.0.0.0/api/v1',
    'ftp://192.0.2.1/api/v1',
    'http://192.0.2.1',
    'http://192.0.2.1/api/v1?secret=x',
    'http://user:password@192.0.2.1/api/v1',
    'http://192.0.2.1/api/v1#fragment',
  ]) {
    f.write('mobile', `EXPO_PUBLIC_API_BASE_URL="${url}"\n`);
    assert.ok(
      inspectSetup(f.root).some((check) => check.status === 'FAIL'),
      url
    );
  }
  f.write(
    'mobile',
    'EXPO_PUBLIC_API_BASE_URL=https://demo.example.org/api/v1/\n'
  );
  assert.equal(
    inspectSetup(f.root).some((check) => check.status === 'FAIL'),
    false
  );
});

test('invalid API settings and secrets fail without exposing their values', (t) => {
  const f = fixture(t);
  f.write('mobile', mobile);
  for (const bad of [
    'PORT=0',
    'MONGODB_URI=https://private-user:private-password@private-host',
    'MONGODB_DB_NAME=private/invalid',
    'JWT_SECRET=private-short-secret',
    'JWT_SECRET="                                 "',
  ]) {
    f.write('api', `${api}${bad}\n`);
    const checks = inspectSetup(f.root);
    assert.ok(checks.some((check) => check.status === 'FAIL'));
    assert.equal(JSON.stringify(checks).includes('private-'), false);
    assert.equal(JSON.stringify(checks).includes('test-only-'), false);
  }
});

test('loopback API binding and partial Cloudinary setup explain demo limitations', (t) => {
  const f = fixture(t);
  f.write('mobile', mobile);
  f.write(
    'api',
    `${api}HOST=127.0.0.1\nCLOUDINARY_API_KEY=private-media-key\n`
  );
  let checks = inspectSetup(f.root);
  assert.ok(
    checks.some(
      (check) => check.status === 'WARN' && check.message.includes('HOST')
    )
  );
  assert.ok(
    checks.some(
      (check) => check.status === 'WARN' && check.message.includes('Cloudinary')
    )
  );
  assert.equal(JSON.stringify(checks).includes('private-media-key'), false);
  f.write(
    'api',
    `${api}CLOUDINARY_CLOUD_NAME=test\nCLOUDINARY_API_KEY=key\nCLOUDINARY_API_SECRET=secret\n`
  );
  checks = inspectSetup(f.root);
  assert.ok(
    checks.some(
      (check) =>
        check.status === 'PASS' &&
        check.message.includes('credentials are not verified')
    )
  );
});

test('root environment file does not silently replace required workspace files', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, '.env'), api + mobile);
  assert.equal(
    inspectSetup(f.root).filter((check) => check.status === 'FAIL').length,
    2
  );
});
