import express from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import { hospitalRoutes } from './modules/hospitals/hospitalRoutes.js';
import { HttpError } from './utils/HttpError.js';

export function createApp({ hospitalRepository, checkDatabase }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(express.json({ limit: '100kb' }));
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
  app.use((_request, _response, next) =>
    next(
      new HttpError(404, 'NOT_FOUND', 'The requested endpoint was not found.')
    )
  );
  app.use(errorHandler);
  return app;
}
