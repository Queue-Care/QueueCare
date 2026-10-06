import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

const STAFF_ROLES = ['RECEPTION', 'NURSE', 'ADMIN'];

// Patients can never review requests, including their own (README 13.7).
export function requireStaff(request, _response, next) {
  if (!request.auth)
    throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  if (!STAFF_ROLES.includes(request.auth.role))
    throw new HttpError(403, 'FORBIDDEN', 'A staff account is required.');
  next();
}

function requestId(request) {
  const id = request.params.requestId;
  if (!/^[a-f\d]{24}$/i.test(id))
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the priority request reference.',
      { requestId: 'Must be a 24-character hexadecimal MongoDB ID.' }
    );
  return new ObjectId(id);
}

export function parseStatusFilter(query) {
  const errors = Object.create(null);
  for (const key of Object.keys(query))
    if (key !== 'status') errors[key] = 'Unsupported query parameter.';
  const status = query.status ?? 'pending';
  if (!['pending', 'decided'].includes(status))
    errors.status = 'Use pending or decided.';
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the request filter.',
      errors
    );
  return status;
}

export function parseDecision(body) {
  const errors = Object.create(null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.body = 'Send a JSON object containing the decision.';
  } else {
    for (const key of Object.keys(body))
      if (!['decision', 'decisionNote'].includes(key))
        errors[key] = 'Unsupported decision field.';
    if (!['ACCEPTED', 'DECLINED'].includes(body.decision))
      errors.decision = 'Choose ACCEPTED or DECLINED.';
    if (
      body.decisionNote !== undefined &&
      (typeof body.decisionNote !== 'string' || body.decisionNote.length > 300)
    )
      errors.decisionNote = 'Must be text of 300 characters or fewer.';
  }
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the decision details.',
      errors
    );
  return {
    decision: body.decision,
    decisionNote: body.decisionNote?.trim() || undefined,
  };
}

export function staffPriorityRoutes(repository, authenticate) {
  const router = Router();
  router.use(authenticate, requireStaff);
  router.use((_request, _response, next) => {
    if (!repository)
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Priority requests are unavailable.'
      );
    next();
  });

  router.get('/', async (request, response) => {
    const status = parseStatusFilter(request.query);
    const { items, pendingCount } = await repository.list(
      request.auth.userId,
      status
    );
    response
      .set('Cache-Control', 'no-store')
      .json({ success: true, data: items, meta: { status, pendingCount } });
  });

  router.get('/:requestId', async (request, response) => {
    const data = await repository.get(
      request.auth.userId,
      requestId(request)
    );
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });

  router.patch('/:requestId/decision', async (request, response) => {
    const id = requestId(request);
    const data = await repository.decide(
      request.auth.userId,
      id,
      parseDecision(request.body)
    );
    response.json({ success: true, data });
  });

  return router;
}
