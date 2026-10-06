import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

export const QUEUE_MUTATION_ROLES = ['DOCTOR', 'ADMIN'];
export const QUEUE_STATUSES = ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED'];

export function requireQueueMutationRole(request, _response, next) {
  if (!request.auth) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  if (!QUEUE_MUTATION_ROLES.includes(request.auth.role))
    throw new HttpError(403, 'FORBIDDEN', 'A doctor or administrator account is required.');
  next();
}

export function parseQueueMutation(request, field) {
  const errors = Object.create(null), value = request.params[field];
  if (!/^[a-f\d]{24}$/i.test(value)) errors[field] = 'Must be a 24-character hexadecimal MongoDB ID.';
  for (const key of Object.keys(request.query)) errors[key] = 'Unsupported query parameter.';
  const body = request.body;
  const statusRequest = field === 'queueEntryId';
  if (body === undefined && !statusRequest) {
    // Call-next accepts no body.
  } else if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.body = 'Send a JSON object.';
  } else {
    for (const key of Object.keys(body))
      if (!statusRequest || key !== 'status') errors[key] = 'Unsupported request field.';
    if (statusRequest && !QUEUE_STATUSES.includes(body.status)) errors.status = 'Choose a recognized queue status.';
  }
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the queue request.', errors);
  return { id: new ObjectId(value), status: body?.status };
}
