import { HttpError } from '../../utils/HttpError.js';

export function parsePatientSearchQuery(query) {
  const errors = Object.create(null);
  for (const key of Object.keys(query))
    if (key !== 'q') errors[key] = 'Unsupported query parameter.';
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (!q || q.length > 120 || /[\x00-\x1f\x7f]/.test(query.q))
    errors.q = 'Enter a single search value of 1 to 120 characters without control characters.';
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the patient search.', errors);
  return q;
}
