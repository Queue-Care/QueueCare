import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { readConfig } from './config/env.js';
import { connectMongo } from './config/mongodb.js';
import { connectionDiagnostic } from './config/connectionDiagnostic.js';
import { readAuthConfig } from './config/auth.js';
import { createMediaStore } from './config/cloudinary.js';
import { authenticate } from './middleware/auth.js';
import { ensureBookingNotificationIndexes } from './modules/bookings/bookingNotification.js';
import {
  createBookingRepository,
  ensureBookingIndexes,
} from './modules/bookings/bookingRepository.js';
import {
  createHospitalRepository,
  ensureHospitalIndexes,
} from './modules/hospitals/hospitalRepository.js';
import {
  createStaffAuthRepository,
  ensureStaffAuthIndexes,
} from './modules/staff/g_staffAuthRepository.js';
import { createStaffDashboardRepository } from './modules/staff/g_staffDashboard.js';
import {
  createPriorityRepository,
  ensurePriorityIndexes,
} from './modules/priority/g_priorityRepository.js';
import {
  createNotificationRepository,
  ensureNotificationIndexes,
} from './modules/notifications/g_notificationRepository.js';
import { createProfileRepository } from './modules/users/g_profileRepository.js';
import {
  createMongoMediaStore,
  ensureProfileImageIndexes,
} from './modules/media/g_mongoMediaStore.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

let connection;
try {
  const config = readConfig();
  const authConfig = readAuthConfig();
  connection = await connectMongo(config);
  await ensureHospitalIndexes(connection.db);
  await ensureStaffAuthIndexes(connection.db);
  await ensureBookingIndexes(connection.db);
  await ensureBookingNotificationIndexes(connection.db);
  await ensureNotificationIndexes(connection.db);
  await ensurePriorityIndexes(connection.db);
  await ensureProfileImageIndexes(connection.db);
  // Profile photos go to Cloudinary when its keys are set, otherwise to MongoDB.
  const profileImageStore = createMongoMediaStore(connection.db);
  const mediaStore = createMediaStore() ?? profileImageStore;
  const priorityRepository = createPriorityRepository(connection.db);
  const notificationRepository = createNotificationRepository(connection.db);
  const server = createServer(
    createApp({
      hospitalRepository: createHospitalRepository(connection.db),
      bookingRepository: createBookingRepository(
        connection.db,
        connection.client
      ),
      staffAuthRepository: createStaffAuthRepository(connection.db, authConfig),
      staffDashboardRepository: createStaffDashboardRepository(connection.db, {
        priorityRepository,
        notificationRepository,
      }),
      priorityRepository,
      notificationRepository,
      profileRepository: createProfileRepository(connection.db, { mediaStore }),
      profileImageStore,
      authenticate: authenticate(connection.db, authConfig),
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
