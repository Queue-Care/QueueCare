import { Router } from 'express';
import { parseHospitalQuery } from './hospitalQuery.js';

export function hospitalRoutes(repository) {
  const router = Router();
  router.get('/', async (request, response) => {
    const query = parseHospitalQuery(request.query);
    const result = await repository.search(query);
    response.json({ success: true, ...result });
  });
  return router;
}
