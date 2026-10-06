import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { requireQueueMutationRole, parseQueueMutation } from './k_queueMutationValidation.js';

// Mounted at /api/v1/staff; existing read-route authorization stays unchanged.
export function queueMutationRoutes(repository, authenticate) {
  const router = Router();
  const handle = (field, method) => async (request, response) => {
    const { id, status } = parseQueueMutation(request, field);
    if (!repository) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Queue updates are unavailable.');
    const data = await repository[method](request.auth.userId, id, status);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  };
  router.post('/sessions/:sessionId/queue/next', authenticate, requireQueueMutationRole, handle('sessionId', 'callNext'));
  router.patch('/queue/:queueEntryId/status', authenticate, requireQueueMutationRole, handle('queueEntryId', 'updateStatus'));
  return router;
}
