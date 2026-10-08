import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
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
import { createPatientPriorityRepository, ensurePatientPriorityIndexes } from './modules/priority/patientPriorityRepository.js';
import { createPatientRegistrationRepository, ensurePatientRegistrationIndexes } from './modules/auth/patientRegistration.js';
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
import { createStaffSessionRepository } from './modules/sessions/k_sessionRepository.js';
import { createStaffPatientSearchRepository } from './modules/staff/k_patientSearchRepository.js';
import { createCheckInRepository } from './modules/bookings/k_checkInRepository.js';
import { createQueueRepository } from './modules/queue/k_queueRepository.js';
import { createSessionMetricsRepository } from './modules/queue/k_sessionMetricsRepository.js';
import { createQueueMutationRepository } from './modules/queue/k_queueMutationRepository.js';
import { ensureQueueIndexes } from './config/indexes.js';
import {
  createPriorityRepository,
  ensurePriorityIndexes,
} from './modules/priority/g_priorityRepository.js';
import {
  createNotificationRepository,
  ensureNotificationIndexes,
} from './modules/notifications/g_notificationRepository.js';
import { createProfileRepository } from './modules/users/g_profileRepository.js';
import { createFileMediaStore } from './modules/media/g_fileMediaStore.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

let connection;
try {
  const config = readConfig();
  const authConfig = readAuthConfig();
  connection = await connectWithRetry(config);
  await ensurePatientRegistrationIndexes(connection.db);
  await ensureHospitalIndexes(connection.db);
  await ensureStaffAuthIndexes(connection.db);
  await ensureBookingIndexes(connection.db);
  await ensureQueueIndexes(connection.db);
  await ensureBookingNotificationIndexes(connection.db);
  await ensureNotificationIndexes(connection.db);
  await ensurePriorityIndexes(connection.db);
  await ensurePatientPriorityIndexes(connection.db);
  // Profile photos go to Cloudinary when its keys are set, otherwise to files in
  // apps/api/profile_photo. Either way MongoDB stores only the photo's link.
  const profileImageStore = createFileMediaStore();
  const mediaStore = createMediaStore() ?? profileImageStore;
  const priorityRepository = createPriorityRepository(connection.db);
  const notificationRepository = createNotificationRepository(connection.db);
  const server = createServer(
    createApp({
      patientRegistrationRepository: createPatientRegistrationRepository(connection.db),
      authConfig,
      hospitalRepository: createHospitalRepository(connection.db),
      bookingRepository: createBookingRepository(
        connection.db,
        connection.client
      ),
      staffAuthRepository: createStaffAuthRepository(connection.db, authConfig),
      staffSessionRepository: createStaffSessionRepository(connection.db),
      staffPatientSearchRepository: createStaffPatientSearchRepository(connection.db),
      checkInRepository: createCheckInRepository(connection.db),
      queueRepository: createQueueRepository(connection.db),
      sessionMetricsRepository: createSessionMetricsRepository(connection.db),
      queueMutationRepository: createQueueMutationRepository(connection.db),
      staffDashboardRepository: createStaffDashboardRepository(connection.db, {
        priorityRepository,
        notificationRepository,
      }),
      priorityRepository,
      patientPriorityRepository: createPatientPriorityRepository(connection.db),
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
