import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { requireStaff } from '../priority/g_priorityRoutes.js';
import { parseCreateSessionBody, parseStaffSessionId, parseStaffSessionQuery } from './k_sessionValidation.js';

export function staffSessionRoutes(repository, authenticate) {
  const router = Router();
  router.use(authenticate, requireStaff);
  router.use((_request, _response, next) => {
    if (!repository)
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Staff sessions are unavailable.');
    next();
  });
  router.get('/', async (request, response) => {
    const result = await repository.list(request.auth.userId, parseStaffSessionQuery(request.query));
    response.set('Cache-Control', 'no-store').json({ success: true, ...result });
  });
  router.post('/', async (request, response) => {
    const input = parseCreateSessionBody(request.body, request.query);
    const data = await repository.create(request.auth.userId, input);
    response.status(201).set('Cache-Control', 'no-store').json({ success: true, data });
  });
  router.get('/:sessionId', async (request, response) => {
    const sessionId = parseStaffSessionId(request.params.sessionId, request.query);
    const data = await repository.get(request.auth.userId, sessionId);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });
  return router;
}
