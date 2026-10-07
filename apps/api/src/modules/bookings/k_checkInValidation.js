import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

export function parseCheckInInput(bookingId, body, query) {
  const errors = Object.create(null);
  if (typeof bookingId !== 'string' || !/^[a-f\d]{24}$/i.test(bookingId))
    errors.bookingId = 'Must be a 24-character hexadecimal MongoDB ID.';
  for (const key of Object.keys(query)) errors[key] = 'Unsupported query parameter.';
  if (body !== undefined) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      errors.body = 'Send no body or an empty JSON object.';
    else for (const key of Object.keys(body)) errors[key] = 'Unsupported check-in field.';
  }
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the booking check-in request.', errors);
  return new ObjectId(bookingId);
}
