import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { authorize } from '../../middleware/authorize.js';
import { HttpError } from '../../utils/HttpError.js';
import { parseBookingListQuery } from './bookingList.js';

export function parseBookingBody(body, query = {}) {
  const errors = Object.create(null);
  for (const key of Object.keys(query))
    errors[key] = 'Unsupported query parameter.';
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.body = 'Send a JSON object containing sessionId.';
  } else {
    for (const key of Object.keys(body))
      if (key !== 'sessionId') errors[key] = 'Unsupported booking field.';
    if (
      typeof body.sessionId !== 'string' ||
      !/^[a-f\d]{24}$/i.test(body.sessionId)
    )
      errors.sessionId = 'Must be a 24-character hexadecimal MongoDB ID.';
  }
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the booking details.',
      errors
    );
  return new ObjectId(body.sessionId);
}
function parseBookingId(request) {
  const errors = Object.create(null);
  if (!/^[a-f\d]{24}$/i.test(request.params.bookingId))
    errors.bookingId = 'Must be a 24-character hexadecimal MongoDB ID.';
  for (const key of Object.keys(request.query))
    errors[key] = 'Unsupported query parameter.';
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the booking reference.',
      errors
    );
  return new ObjectId(request.params.bookingId);
}
export function bookingRoutes(repository, authenticate) {
  const router = Router();
  router.get(
    '/me',
    authenticate,
    authorize('PATIENT'),
    async (request, response) => {
      const query = parseBookingListQuery(request.query);
      if (!repository)
        throw new HttpError(
          503,
          'SERVICE_UNAVAILABLE',
          'Bookings are unavailable.'
        );
      const result = await repository.list(request.auth.userId, query);
      response
        .set('Cache-Control', 'no-store')
        .json({ success: true, ...result });
    }
  );
  router.post(
    '/',
    authenticate,
    authorize('PATIENT'),
    async (request, response) => {
      const sessionId = parseBookingBody(request.body, request.query);
      if (!repository)
        throw new HttpError(
          503,
          'SERVICE_UNAVAILABLE',
          'Booking is not available.'
        );
      const booking = await repository.create(request.auth.userId, sessionId);
      response.status(201).json({ success: true, data: booking });
    }
  );
  router.get(
    '/:bookingId',
    authenticate,
    authorize('PATIENT'),
    async (request, response) => {
      const bookingId = parseBookingId(request);
      if (!repository)
        throw new HttpError(
          503,
          'SERVICE_UNAVAILABLE',
          'Booking details are unavailable.'
        );
      const booking = await repository.getDetails(
        request.auth.userId,
        bookingId
      );
      response
        .set('Cache-Control', 'no-store')
        .json({ success: true, data: booking });
    }
  );
  router.patch(
    '/:bookingId/cancel',
    authenticate,
    authorize('PATIENT'),
    async (request, response) => {
      const bookingId = parseBookingId(request);
      if (!repository?.cancel)
        throw new HttpError(
          503,
          'SERVICE_UNAVAILABLE',
          'Cancellation is unavailable.'
        );
      const booking = await repository.cancel(request.auth.userId, bookingId);
      response
        .set('Cache-Control', 'no-store')
        .json({ success: true, data: booking });
    }
  );
  return router;
}
