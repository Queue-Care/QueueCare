import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { registerPatient } from './patientRegistration.js';
import { loginPatient } from './patientLogin.js';

export function patientAuthRoutes(repository, authConfig) {
  const router = Router();
  router.post('/login', async (request, response) => {
    if (!repository) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Patient login is unavailable.');
    response.json({ success: true, data: await loginPatient(repository, authConfig, request.body) });
  });
  router.post('/register', async (request, response) => {
    if (!repository)
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Registration is unavailable. Please try again later.');
    const data = await registerPatient(repository, request.body);
    response.status(201).json({ success: true, data });
  });
  return router;
}
