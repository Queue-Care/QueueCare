import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionDiagnostic } from '../config/connectionDiagnostic.js';

test('recognizes nested Atlas TLS failures without exposing driver messages or credentials', () => {
  const error = {
    name: 'MongoServerSelectionError',
    message: 'mongodb+srv://private-user:private-password@private-host',
    reason: {
      servers: new Map([
        [
          'private-host',
          {
            error: {
              name: 'MongoNetworkError',
              cause: { code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' },
            },
          },
        ],
      ]),
    },
  };
  const diagnostic = connectionDiagnostic(error);
  assert.match(diagnostic, /TLS connection failed before authentication/);
  assert.match(diagnostic, /current public IP/);
  assert.ok(!diagnostic.includes('private-'));
});
test('distinguishes DNS failures from refused local connections and bad passwords', () => {
  assert.match(
    connectionDiagnostic({ code: 'ECONNREFUSED', syscall: 'querySrv' }),
    /DNS lookup failed/
  );
  assert.match(
    connectionDiagnostic({ code: 'ECONNREFUSED' }),
    /refused the connection/
  );
  assert.match(connectionDiagnostic({ code: 18 }), /authentication failed/);
  assert.match(connectionDiagnostic({ code: 13 }), /lacks permission/);
  assert.match(
    connectionDiagnostic({ name: 'MongoServerSelectionError' }),
    /unreachable/
  );
  assert.match(
    connectionDiagnostic({ code: 'EADDRINUSE' }),
    /port is already in use/
  );
});
test('unknown and cyclic errors produce a safe diagnostic', () => {
  const error = new Error('private-password');
  error.cause = error;
  assert.match(connectionDiagnostic(error), /npm run check:db/);
  assert.ok(!connectionDiagnostic(error).includes('private-password'));
  assert.match(connectionDiagnostic(null), /Check apps\/api\/\.env/);
});
