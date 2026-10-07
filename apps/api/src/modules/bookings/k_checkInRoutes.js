import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { requireStaff } from '../priority/g_priorityRoutes.js';
import { parseCheckInInput } from './k_checkInValidation.js';

export function checkInRoutes(repository, authenticate) {
  const router = Router();
  router.post('/:bookingId/check-in', authenticate, requireStaff, async (request, response) => {
    const bookingId = parseCheckInInput(request.params.bookingId, request.body, request.query);
    if (!repository) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Check-in is unavailable.');
    const data = await repository.checkIn(request.auth.userId, bookingId);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });
  return router;
}
