import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

export const SESSION_TIME_ZONE = 'Asia/Colombo';
export function colomboDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: SESSION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function isSessionDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function parseSessionQuery(query) {
  const errors = Object.create(null);
  for (const key of Object.keys(query)) {
    if (!['date', 'serviceId'].includes(key))
      errors[key] = 'Unsupported query parameter.';
  }
  if (query.date !== undefined && !isSessionDate(query.date))
    errors.date = 'Must be a real calendar date in YYYY-MM-DD format.';
  if (
    query.serviceId !== undefined &&
    (typeof query.serviceId !== 'string' ||
      !/^[a-f\d]{24}$/i.test(query.serviceId))
  )
    errors.serviceId = 'Must be a 24-character hexadecimal MongoDB ID.';
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the session filters.',
      errors
    );
  return {
    date: query.date,
    serviceId:
      query.serviceId === undefined ? undefined : new ObjectId(query.serviceId),
  };
}
