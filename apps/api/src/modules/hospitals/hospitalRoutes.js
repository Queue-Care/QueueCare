import { Router } from 'express';
import { parseHospitalQuery } from './hospitalQuery.js';
import { parseHospitalId, rejectHospitalDetailQuery } from './hospitalId.js';
import { parseSessionQuery } from './sessionQuery.js';

export function hospitalRoutes(repository) {
  const router = Router();
  router.get('/', async (request, response) => {
    const query = parseHospitalQuery(request.query);
    const result = await repository.search(query);
    response.json({ success: true, ...result });
  });
  router.get('/:hospitalId', async (request, response) => {
    const hospitalId = parseHospitalId(request.params.hospitalId);
    rejectHospitalDetailQuery(request.query);
    const hospital = await repository.getDetails(hospitalId);
    response.json({ success: true, data: hospital });
  });
  router.get('/:hospitalId/services', async (request, response) => {
    const hospitalId = parseHospitalId(request.params.hospitalId);
    rejectHospitalDetailQuery(request.query);
    const services = await repository.getServices(hospitalId);
    response.json({
      success: true,
      data: services,
      meta: { total: services.length },
    });
  });
  router.get('/:hospitalId/sessions', async (request, response) => {
    const hospitalId = parseHospitalId(request.params.hospitalId);
    const query = parseSessionQuery(request.query);
    const result = await repository.getSessions(hospitalId, query);
    response.json({ success: true, ...result });
  });
  return router;
}
