import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { isSessionDate } from '../hospitals/sessionQuery.js';

export const SESSION_STATUSES = ['OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'];
const objectId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export function parseCreateSessionBody(body, query = {}) {
  const errors = Object.create(null);
  for (const key of Object.keys(query)) errors[key] = 'Unsupported query parameter.';
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.body = 'Send a JSON object containing session details.';
  } else {
    const allowed = ['serviceId', 'sessionDate', 'startTime', 'endTime', 'capacity', 'doctorOrTeam'];
    for (const key of Object.keys(body))
      if (!allowed.includes(key)) errors[key] = 'Unsupported session field.';
    if (!objectId(body.serviceId))
      errors.serviceId = 'Must be a 24-character hexadecimal MongoDB ID.';
    if (!isSessionDate(body.sessionDate))
      errors.sessionDate = 'Must be a real calendar date in YYYY-MM-DD format.';
    for (const key of ['startTime', 'endTime']) {
      if (typeof body[key] !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body[key]))
        errors[key] = 'Use zero-padded 24-hour HH:mm format.';
    }
    if (!errors.startTime && !errors.endTime && body.endTime <= body.startTime)
      errors.endTime = 'End time must be after start time on the same day.';
    if (!Number.isSafeInteger(body.capacity) || body.capacity <= 0)
      errors.capacity = 'Capacity must be a positive safe integer.';
    if (typeof body.doctorOrTeam !== 'string' || !body.doctorOrTeam.trim())
      errors.doctorOrTeam = 'Enter the doctor or clinic team.';
  }
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the session details.', errors);
  return {
    serviceId: new ObjectId(body.serviceId),
    sessionDate: new Date(`${body.sessionDate}T00:00:00.000Z`),
    startTime: body.startTime,
    endTime: body.endTime,
    capacity: body.capacity,
    doctorOrTeam: body.doctorOrTeam.trim(),
  };
}

export function parseStaffSessionQuery(query) {
  const errors = Object.create(null);
  for (const key of Object.keys(query)) {
    if (!['view', 'date', 'serviceId', 'status', 'page', 'limit'].includes(key))
      errors[key] = 'Unsupported query parameter.';
  }
  if (query.view !== undefined && !['today', 'upcoming'].includes(query.view))
    errors.view = 'Use today or upcoming.';
  if (query.date !== undefined && !isSessionDate(query.date))
    errors.date = 'Must be a real calendar date in YYYY-MM-DD format.';
  if (query.date !== undefined && query.view !== undefined)
    errors.date = 'Use an exact date or a view, not both.';
  if (query.serviceId !== undefined && !objectId(query.serviceId))
    errors.serviceId = 'Must be a 24-character hexadecimal MongoDB ID.';
  if (query.status !== undefined && !SESSION_STATUSES.includes(query.status))
    errors.status = 'Use OPEN, CLOSED, RUNNING, COMPLETED, or CANCELLED.';
  const integer = (key, fallback, maximum) => {
    if (query[key] === undefined) return fallback;
    if (typeof query[key] !== 'string' || !/^[1-9]\d*$/.test(query[key]) ||
        !Number.isSafeInteger(Number(query[key])) || Number(query[key]) > maximum) {
      errors[key] = `Use an integer from 1 to ${maximum}.`;
      return fallback;
    }
    return Number(query[key]);
  };
  const page = integer('page', 1, 10000);
  const limit = integer('limit', 50, 100);
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the staff session filters.', errors);
  return {
    view: query.date === undefined ? query.view ?? 'today' : undefined,
    date: query.date,
    serviceId: query.serviceId === undefined ? undefined : new ObjectId(query.serviceId),
    status: query.status,
    page,
    limit,
  };
}

export function parseStaffSessionId(value, query = {}) {
  const errors = Object.create(null);
  if (!objectId(value)) errors.sessionId = 'Must be a 24-character hexadecimal MongoDB ID.';
  for (const key of Object.keys(query)) errors[key] = 'Unsupported query parameter.';
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the session reference.', errors);
  return new ObjectId(value);
}
