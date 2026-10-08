import { createApp } from './app.js';
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

// Builds the Express app on an open MongoDB connection. Shared by the local
// server (src/server.js) and the Vercel function (api/index.js).
export async function createApiApp(connection, authConfig) {
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
  return createApp({
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
  });
}
