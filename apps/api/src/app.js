import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { hospitalRoutes } from './modules/hospitals/hospitalRoutes.js';
import { HttpError } from './utils/HttpError.js';
import { bookingRoutes } from './modules/bookings/bookingRoutes.js';
import { staffAuthRoutes } from './modules/staff/g_staffAuthRoutes.js';
import { staffDashboardRoutes } from './modules/staff/g_staffDashboard.js';
import { staffPriorityRoutes } from './modules/priority/g_priorityRoutes.js';
import { notificationRoutes } from './modules/notifications/g_notificationRoutes.js';
import { profileRoutes } from './modules/users/g_profileRoutes.js';
import { mediaRoutes } from './modules/media/g_mongoMediaStore.js';
import { patientAuthRoutes } from './modules/auth/patientAuthRoutes.js';
import { staffSessionRoutes } from './modules/sessions/k_sessionRoutes.js';
import { staffPatientSearchRoutes } from './modules/staff/k_patientSearchRoutes.js';
import { checkInRoutes } from './modules/bookings/k_checkInRoutes.js';
import { staffQueueRoutes } from './modules/queue/k_queueRoutes.js';
import { sessionMetricsRoutes } from './modules/queue/k_sessionMetricsRoutes.js';
import { queueMutationRoutes } from './modules/queue/k_queueMutationRoutes.js';

export function createApp({
  hospitalRepository,
  checkDatabase,
  bookingRepository,
  staffAuthRepository,
  staffDashboardRepository,
  staffSessionRepository,
  staffPatientSearchRepository,
  checkInRepository,
  queueRepository,
  sessionMetricsRepository,
  queueMutationRepository,
  priorityRepository,
  notificationRepository,
  profileRepository,
  profileImageStore,
  authenticate,
  patientRegistrationRepository,
  authConfig,
}) {
  const requireSignIn =
    authenticate ??
    ((_request, _response) => {
      throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
    });
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  // Lets the app run in a browser (Expo web), which calls the API from another origin.
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1/auth/patient', patientAuthRoutes(patientRegistrationRepository, authConfig));
  app.get('/health', async (_request, response) => {
    try {
      await checkDatabase();
    } catch {
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'The database is unavailable. Please try again.'
      );
    }
    response.json({
      success: true,
      data: { status: 'ok', database: 'connected' },
    });
  });
  app.use('/api/v1/hospitals', hospitalRoutes(hospitalRepository));
  app.use('/api/v1/staff/auth', staffAuthRoutes(staffAuthRepository));
  app.use('/api/v1/staff', queueMutationRoutes(queueMutationRepository, requireSignIn));
  app.use('/api/v1/staff/sessions', staffQueueRoutes(queueRepository, requireSignIn));
  app.use('/api/v1/staff/sessions', sessionMetricsRoutes(sessionMetricsRepository, requireSignIn));
  app.use('/api/v1/staff/sessions', staffSessionRoutes(staffSessionRepository, requireSignIn));
  app.use('/api/v1/staff/patients', staffPatientSearchRoutes(staffPatientSearchRepository, requireSignIn));
  app.use(
    '/api/v1/staff/dashboard',
    staffDashboardRoutes(staffDashboardRepository, requireSignIn)
  );
  app.use(
    '/api/v1/staff/priority-requests',
    staffPriorityRoutes(priorityRepository, requireSignIn)
  );
  app.use(
    '/api/v1/notifications',
    notificationRoutes(notificationRepository, requireSignIn)
  );
  app.use('/api/v1/me', profileRoutes(profileRepository, requireSignIn));
  app.use('/api/v1/media', mediaRoutes(profileImageStore));
  app.use('/api/v1/bookings', checkInRoutes(checkInRepository, requireSignIn));
  app.use('/api/v1/bookings', bookingRoutes(bookingRepository, requireSignIn));
  app.use((_request, _response, next) =>
    next(
      new HttpError(404, 'NOT_FOUND', 'The requested endpoint was not found.')
    )
  );
  app.use(errorHandler);
  return app;
}
