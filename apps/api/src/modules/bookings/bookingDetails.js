import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { sessionTimestamp } from './sessionTime.js';

const bookingStatuses = [
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'SKIPPED',
  'RESCHEDULED',
];
const sessionStatuses = ['OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'];
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const date = (value) =>
  value instanceof Date && Number.isFinite(value.getTime());
const incomplete = () =>
  new HttpError(
    409,
    'BOOKING_DETAILS_UNAVAILABLE',
    'The saved booking summary is unavailable. Please try again later.'
  );

export async function readBookingDetails(db, patientId, bookingId) {
  const booking = await db.collection('bookings').findOne(
    { _id: bookingId, patientId },
    {
      projection: {
        _id: 1,
        bookingCode: 1,
        patientId: 1,
        sessionId: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
      },
      maxTimeMS: 3000,
    }
  );
  // Missing and another patient's booking have exactly the same response.
  if (
    !booking ||
    !(booking.patientId instanceof ObjectId) ||
    !booking.patientId.equals(patientId)
  )
    throw new HttpError(404, 'NOT_FOUND', 'Booking not found.');
  if (
    !(booking.sessionId instanceof ObjectId) ||
    !text(booking.bookingCode) ||
    !bookingStatuses.includes(booking.status) ||
    !date(booking.createdAt) ||
    !date(booking.updatedAt) ||
    booking.updatedAt < booking.createdAt
  )
    throw incomplete();
  const session = await db.collection('opdSessions').findOne(
    { _id: booking.sessionId },
    {
      projection: {
        _id: 1,
        hospitalId: 1,
        serviceId: 1,
        doctorOrTeam: 1,
        sessionDate: 1,
        startTime: 1,
        endTime: 1,
        status: 1,
      },
      maxTimeMS: 3000,
    }
  );
  if (
    !session ||
    !(session.hospitalId instanceof ObjectId) ||
    !(session.serviceId instanceof ObjectId) ||
    !text(session.doctorOrTeam) ||
    !date(session.sessionDate) ||
    !session.sessionDate.toISOString().endsWith('T00:00:00.000Z') ||
    !['startTime', 'endTime'].every(
      (key) =>
        typeof session[key] === 'string' &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(session[key])
    ) ||
    session.endTime <= session.startTime ||
    !sessionStatuses.includes(session.status)
  )
    throw incomplete();
  const [hospital, service, times] = await Promise.all([
    db
      .collection('hospitals')
      .findOne(
        { _id: session.hospitalId },
        {
          projection: { _id: 1, name: 1, address: 1, city: 1, isActive: 1 },
          maxTimeMS: 3000,
        }
      ),
    db
      .collection('opdServices')
      .findOne(
        { _id: session.serviceId, hospitalId: session.hospitalId },
        {
          projection: { _id: 1, hospitalId: 1, name: 1, isActive: 1 },
          maxTimeMS: 3000,
        }
      ),
    // Calculate from the validated values just read, rather than rereading a possibly edited date/time.
    db
      .collection('bookings')
      .aggregate(
        [
          { $match: { _id: bookingId, patientId } },
          {
            $project: {
              sessionDate: { $literal: session.sessionDate },
              startTime: { $literal: session.startTime },
              endTime: { $literal: session.endTime },
            },
          },
          {
            $project: {
              startsAt: sessionTimestamp('startTime'),
              endsAt: sessionTimestamp('endTime'),
            },
          },
        ],
        { maxTimeMS: 3000 }
      )
      .next(),
  ]);
  if (
    !hospital ||
    !service ||
    !(service.hospitalId instanceof ObjectId) ||
    !service.hospitalId.equals(hospital._id) ||
    !['name', 'address', 'city'].every((key) => text(hospital[key])) ||
    !text(service.name) ||
    typeof hospital.isActive !== 'boolean' ||
    typeof service.isActive !== 'boolean' ||
    !date(times?.startsAt) ||
    !date(times?.endsAt) ||
    times.endsAt <= times.startsAt
  )
    throw incomplete();
  // Existing bookings remain readable when services are unpublished or sessions stop taking bookings.
  const priorityRequest = await db.collection('priorityRequests').findOne(
    { bookingId, patientId, status: { $in: ['PENDING', 'ACCEPTED'] } },
    { projection: { _id: 1 }, maxTimeMS: 3000 }
  );
  return {
    _id: booking._id.toString(),
    bookingCode: booking.bookingCode,
    ...(priorityRequest ? { priorityRequestId: priorityRequest._id.toString() } : {}),
    patientId: patientId.toString(),
    sessionId: session._id.toString(),
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    hospital: {
      _id: hospital._id.toString(),
      name: hospital.name,
      address: hospital.address,
      city: hospital.city,
      isActive: hospital.isActive,
    },
    service: {
      _id: service._id.toString(),
      name: service.name,
      isActive: service.isActive,
    },
    session: {
      _id: session._id.toString(),
      hospitalId: hospital._id.toString(),
      serviceId: service._id.toString(),
      doctorOrTeam: session.doctorOrTeam,
      status: session.status,
      sessionDate: session.sessionDate.toISOString().slice(0, 10),
      startTime: session.startTime,
      endTime: session.endTime,
      startsAt: times.startsAt.toISOString(),
      endsAt: times.endsAt.toISOString(),
    },
  };
}
