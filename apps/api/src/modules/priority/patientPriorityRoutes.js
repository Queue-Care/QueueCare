import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { authorize } from '../../middleware/authorize.js';
import { HttpError } from '../../utils/HttpError.js';
import { PRIORITY_REASONS } from './g_priorityRepository.js';

export function parsePrioritySubmission(body, bookingId, query = {}) {
  const errors = {};
  if (!/^[a-f\d]{24}$/i.test(bookingId)) errors.bookingId = 'Enter a valid booking reference.';
  for (const key of Object.keys(query)) errors[key] = 'Unsupported query parameter.';
  if (!body || typeof body !== 'object' || Array.isArray(body)) errors.body = 'Send your request details as JSON.';
  else {
    for (const key of Object.keys(body)) if (!['reason', 'note'].includes(key)) errors[key] = 'Unsupported request field.';
    if (!PRIORITY_REASONS.includes(body.reason)) errors.reason = 'Choose a reason for requesting priority.';
    if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.note))) errors.note = 'Use a note of 500 characters or fewer.';
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Check your priority request details.', errors);
  return { bookingId: new ObjectId(bookingId), reason: body.reason, note: body.note?.trim() || undefined };
}

export function patientPriorityRoutes(repository, authenticate) {
  const router = Router();
  const available = (_request, _response, next) => {
    if (!repository) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Priority requests are unavailable.');
    next();
  };
  router.post('/bookings/:bookingId/priority-requests', authenticate, authorize('PATIENT'), available, async (request, response) => {
    const input = parsePrioritySubmission(request.body, request.params.bookingId, request.query);
    const data = await repository.create(request.auth.userId, input);
    response.status(201).json({ success: true, data });
  });
  router.get('/priority-requests/me', authenticate, authorize('PATIENT'), available, async (request, response) => {
    if (Object.keys(request.query).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Unsupported query parameters.');
    const data = await repository.list(request.auth.userId);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });
  return router;
}
