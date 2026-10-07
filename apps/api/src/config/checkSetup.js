import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { readConfig } from './env.js';
import { readAuthConfig } from './auth.js';

// Inspect the documented base files only. Do not load them into process.env,
// connect to services, change files, or print supplied values/errors.
export function inspectSetup(root) {
  const checks = [];
  const add = (status, message) => checks.push({ status, message });
  function read(relative) {
    try {
      return parse(readFileSync(resolve(root, relative)));
    } catch (error) {
      add(
        'FAIL',
        error.code === 'ENOENT'
          ? `${relative} is missing. Follow docs/SETUP.md.`
          : `${relative} could not be read. Check its permissions.`
      );
      return null;
    }
  }
  const api = read('apps/api/.env');
  if (api) {
    try {
      readConfig(api);
      if (!api.MONGODB_URI?.trim()) {
        add(
          'FAIL',
          'Set MONGODB_URI explicitly in apps/api/.env for the intended development database.'
        );
      } else
        add(
          'PASS',
          'API port and database configuration have valid basic syntax.'
        );
    } catch {
      add(
        'FAIL',
        'Check PORT, MONGODB_URI and MONGODB_DB_NAME in apps/api/.env.'
      );
    }
    try {
      if (!readAuthConfig(api)) throw new Error();
      add('PASS', 'JWT_SECRET is present and meets the minimum length.');
    } catch {
      add(
        'FAIL',
        'Set a random JWT_SECRET of at least 32 bytes in apps/api/.env; sign-in needs it.'
      );
    }
    if (['127.0.0.1', 'localhost', '::1'].includes(api.HOST?.trim()))
      add(
        'WARN',
        'API HOST only accepts local connections. Use 0.0.0.0 for the documented Expo Go LAN setup.'
      );
    const mediaKeys = [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ];
    const count = mediaKeys.filter((key) => api[key]?.trim()).length;
    add(
      count === 3 ? 'PASS' : 'WARN',
      count === 3
        ? 'All three Cloudinary settings are present; credentials are not verified.'
        : 'Cloudinary settings are incomplete or absent; the current server uses MongoDB photo storage.'
    );
  }
  const mobile = read('apps/mobile/.env');
  if (mobile) {
    try {
      const url = new URL(mobile.EXPO_PUBLIC_API_BASE_URL?.trim());
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname.replace(/\/+$/, '') !== '/api/v1' ||
        /YOUR_|<|>|\$\{/i.test(mobile.EXPO_PUBLIC_API_BASE_URL)
      )
        throw new Error();
      if (
        ['localhost', '127.0.0.1', '[::1]', '0.0.0.0', '[::]'].includes(
          url.hostname
        )
      ) {
        add(
          'FAIL',
          'The mobile URL uses a loopback or bind address. Use the API computer LAN address for a physical phone.'
        );
      } else
        add(
          'PASS',
          'Mobile API URL is configured with an HTTP(S) host and /api/v1 path.'
        );
    } catch {
      add(
        'FAIL',
        'Set a literal EXPO_PUBLIC_API_BASE_URL ending in /api/v1 in apps/mobile/.env; replace the example host.'
      );
    }
  }
  return checks;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const checks = inspectSetup(root);
  console.log('QueueCare base .env checks (read-only; no network requests).');
  for (const check of checks) console.log(`${check.status}: ${check.message}`);
  console.log(
    'Shell and Expo .env overrides are not evaluated. Restart Expo after URL changes.'
  );
  console.log(
    'Next: npm run check:db, start the API, and open its /health URL on your phone.'
  );
  process.exitCode = checks.some((check) => check.status === 'FAIL') ? 1 : 0;
}
