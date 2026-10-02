import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from './app.js';
import { readConfig } from './config/env.js';
import { connectMongo } from './config/mongodb.js';
import { connectionDiagnostic } from './config/connectionDiagnostic.js';
import {
  createHospitalRepository,
  ensureHospitalIndexes,
} from './modules/hospitals/hospitalRepository.js';

let connection;
try {
  const config = readConfig();
  connection = await connectMongo(config);
  await ensureHospitalIndexes(connection.db);
  const server = createServer(
    createApp({
      hospitalRepository: createHospitalRepository(connection.db),
      checkDatabase: () => connection.db.command({ ping: 1 }),
    })
  );
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
  console.error(`API startup failed. ${connectionDiagnostic(error)}`);
  if (connection) await connection.client.close();
  process.exitCode = 1;
}
