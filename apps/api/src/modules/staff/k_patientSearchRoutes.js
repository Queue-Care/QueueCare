import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { requireStaff } from '../priority/g_priorityRoutes.js';
import { parsePatientSearchQuery } from './k_patientSearchValidation.js';

export function staffPatientSearchRoutes(repository, authenticate) {
  const router = Router();
  router.get('/search', authenticate, requireStaff, async (request, response) => {
    const q = parsePatientSearchQuery(request.query);
    if (!repository)
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Patient search is unavailable.');
    const data = await repository.search(request.auth.userId, q);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });
  return router;
}
