import { HttpError } from '../../utils/HttpError.js';
import { sessionTimestamp } from './sessionTime.js';
import { readBookingDetails } from './bookingDetails.js';

export function parseBookingListQuery(query) {
  const errors = Object.create(null);
  for (const key of Object.keys(query))
    if (!['status', 'page', 'limit'].includes(key))
      errors[key] = 'Unsupported query parameter.';
  const status = query.status ?? 'upcoming';
  if (!['upcoming', 'past'].includes(status))
    errors.status = 'Must be upcoming or past.';
  function number(key, fallback, max) {
    if (query[key] === undefined) return fallback;
    const value = query[key];
    if (
      typeof value !== 'string' ||
      !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > max
    ) {
      errors[key] = `Must be a whole number between 1 and ${max}.`;
      return fallback;
    }
    return Number(value);
  }
  const page = number('page', 1, 1000),
    limit = number('limit', 20, 50);
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the booking filters.',
      errors
    );
  return { status, page, limit };
}

export async function readBookingList(
  db,
  patientId,
  { status, page, limit },
  now
) {
  // Scope before joining, filtering, sorting or limiting. Never accept a patient ID from the query.
  const upcoming = {
    $and: [
      { $eq: ['$status', 'CONFIRMED'] },
      { $in: ['$session.status', ['OPEN', 'CLOSED', 'RUNNING']] },
      {
        $or: [
          { $gt: ['$endsAt', now] },
          { $eq: ['$session.status', 'RUNNING'] },
        ],
      },
    ],
  };
  const category = {
    $match: { $expr: status === 'upcoming' ? upcoming : { $not: [upcoming] } },
  };
  const [result] = await db
    .collection('bookings')
    .aggregate(
      [
        { $match: { patientId } },
        {
          $lookup: {
            from: 'opdSessions',
            localField: 'sessionId',
            foreignField: '_id',
            as: 'session',
          },
        },
        { $unwind: { path: '$session', preserveNullAndEmptyArrays: true } },
        {
          $set: {
            sessionDate: '$session.sessionDate',
            startTime: '$session.startTime',
            endTime: '$session.endTime',
          },
        },
        {
          $set: {
            startsAt: sessionTimestamp('startTime'),
            endsAt: sessionTimestamp('endTime'),
          },
        },
        {
          $facet: {
            invalid: [
              {
                $match: {
                  $or: [
                    { 'session._id': { $exists: false } },
                    { startsAt: null },
                    { endsAt: null },
                    { $expr: { $lte: ['$endsAt', '$startsAt'] } },
                    {
                      status: {
                        $nin: [
                          'CONFIRMED',
                          'CANCELLED',
                          'COMPLETED',
                          'SKIPPED',
                          'RESCHEDULED',
                        ],
                      },
                    },
                    {
                      'session.status': {
                        $nin: [
                          'OPEN',
                          'CLOSED',
                          'RUNNING',
                          'COMPLETED',
                          'CANCELLED',
                        ],
                      },
                    },
                  ],
                },
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            entries: [
              category,
              {
                $sort: {
                  startsAt: status === 'upcoming' ? 1 : -1,
                  _id: status === 'upcoming' ? 1 : -1,
                },
              },
              { $skip: (page - 1) * limit },
              { $limit: limit },
              { $project: { _id: 1 } },
            ],
            count: [category, { $count: 'total' }],
          },
        },
      ],
      { maxTimeMS: 5000 }
    )
    .toArray();
  if (result.invalid.length)
    throw new HttpError(
      409,
      'BOOKING_DETAILS_UNAVAILABLE',
      'Your saved bookings could not be read. Please try again later.'
    );
  // Reuse the owner-checked summary projection and validation. Missing linked data must not look like an empty list.
  const data = [];
  for (const entry of result.entries) {
    const booking = await readBookingDetails(db, patientId, entry._id);
    data.push({
      _id: booking._id,
      bookingCode: booking.bookingCode,
      status: booking.status,
      hospitalName: booking.hospital.name,
      serviceName: booking.service.name,
      startsAt: booking.session.startsAt,
    });
  }
  const total = result.count[0]?.total ?? 0;
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
  };
}
