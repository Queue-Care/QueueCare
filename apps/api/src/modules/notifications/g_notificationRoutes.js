import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

function notificationId(request) {
  const id = request.params.notificationId;
  if (!/^[a-f\d]{24}$/i.test(id))
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the notification reference.',
      { notificationId: 'Must be a 24-character hexadecimal MongoDB ID.' }
    );
  return new ObjectId(id);
}

// Every signed-in role (patient or staff) reads only its own notifications.
export function notificationRoutes(repository, authenticate) {
  const router = Router();
  router.use(authenticate);
  router.use((_request, _response, next) => {
    if (!repository)
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Notifications are unavailable.'
      );
    next();
  });

  router.get('/', async (request, response) => {
    const { items, unreadCount } = await repository.list(request.auth.userId);
    response
      .set('Cache-Control', 'no-store')
      .json({ success: true, data: items, meta: { unreadCount } });
  });

  router.patch('/read-all', async (request, response) => {
    const data = await repository.markAllRead(request.auth.userId);
    response.json({ success: true, data, meta: { unreadCount: 0 } });
  });

  router.patch('/:notificationId/read', async (request, response) => {
    const data = await repository.markRead(
      request.auth.userId,
      notificationId(request)
    );
    const unreadCount = await repository.unreadCount(request.auth.userId);
    response.json({ success: true, data, meta: { unreadCount } });
  });

  router.delete('/:notificationId', async (request, response) => {
    const data = await repository.remove(
      request.auth.userId,
      notificationId(request)
    );
    const unreadCount = await repository.unreadCount(request.auth.userId);
    response.json({ success: true, data, meta: { unreadCount } });
  });

  return router;
}
