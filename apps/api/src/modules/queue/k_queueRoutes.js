import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { requireStaff } from '../priority/g_priorityRoutes.js';
import { parseQueueSessionId } from './k_queueValidation.js';

export function staffQueueRoutes(repository, authenticate) {
  const router = Router();
  router.get('/:sessionId/queue', authenticate, requireStaff, async (request, response) => {
    const sessionId = parseQueueSessionId(request.params.sessionId, request.query);
    if (!repository) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Queue read is unavailable.');
    const data = await repository.getStaffSnapshot(request.auth.userId, sessionId);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });
  return router;
}
