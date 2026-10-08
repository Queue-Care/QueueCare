import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { readConfig } from './config/env.js';
import { connectMongo } from './config/mongodb.js';
import { connectionDiagnostic } from './config/connectionDiagnostic.js';
import { readAuthConfig } from './config/auth.js';
import { createApiApp } from './bootstrap.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

let connection;
try {
  const config = readConfig();
  const authConfig = readAuthConfig();
  connection = await connectWithRetry(config);
  const server = createServer(await createApiApp(connection, authConfig));
  server.listen(config.port, config.host);
  await once(server, 'listening');
  console.log(`QueueCare API listening on ${config.host}:${config.port}`);
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => server.closeAllConnections(), 5000);
    timeout.unref();
    await new Promise((resolve) => server.close(resolve));
    clearTimeout(timeout);
    await connection.client.close();
  };
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      void shutdown().catch(() => {
        process.exitCode = 1;
      });
    });
  }
} catch (error) {
  if (connection) await connection.client.close();
  // Starting the API twice is a slip, not a failure: it is already serving.
  if (error?.code === 'EADDRINUSE' && (await isQueueCareApi(error.port))) {
    console.log(
      `QueueCare API is already running on port ${error.port}, so there is nothing to start. To restart it, stop the other one first (Ctrl+C in its terminal).`
    );
  } else {
    console.error(`API startup failed. ${connectionDiagnostic(error)}`);
    process.exitCode = 1;
  }
}

// The database can be out of reach for a moment (Wi-Fi still joining, laptop
// just woke up). Try a few times before calling the startup failed; a wrong
// password or connection string fails straight away.
async function connectWithRetry(config, attempts = 5, waitMs = 2000) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await connectMongo(config);
    } catch (error) {
      const unreachable =
        ['MongoServerSelectionError', 'MongoNetworkError'].includes(
          error?.name
        ) || ['querySrv', 'queryTxt'].includes(error?.syscall);
      if (!unreachable || attempt >= attempts) throw error;
      console.log(
        `MongoDB is not reachable yet, trying again (${attempt + 1}/${attempts})...`
      );
      await delay(waitMs);
    }
  }
}

// True when the busy port answers /health the way this API does.
async function isQueueCareApi(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return (await response.json())?.data?.status === 'ok';
  } catch {
    return false;
  }
}
