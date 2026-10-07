import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

export function parseQueueSessionId(value, query) {
  const errors = Object.create(null);
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    errors.sessionId = 'Must be a 24-character hexadecimal MongoDB ID.';
  for (const key of Object.keys(query)) errors[key] = 'Unsupported query parameter.';
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the queue request.', errors);
  return new ObjectId(value);
}
