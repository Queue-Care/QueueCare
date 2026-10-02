import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

export function parseHospitalId(value) {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the hospital ID.', {
      hospitalId: 'Must be a 24-character hexadecimal MongoDB ID.',
    });
  }
  return new ObjectId(value);
}

export function rejectHospitalDetailQuery(query) {
  const fields = Object.create(null);
  for (const key of Object.keys(query))
    fields[key] = 'Unsupported query parameter.';
  if (Object.keys(fields).length) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'This endpoint does not accept query parameters.',
      fields
    );
  }
}
