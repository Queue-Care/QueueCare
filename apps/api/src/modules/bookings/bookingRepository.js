import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { sessionTimestamp as timestamp } from './sessionTime.js';
import { readBookingDetails } from './bookingDetails.js';
import { insertBookingConfirmation } from './bookingNotification.js';
import { readBookingList } from './bookingList.js';

export async function ensureBookingIndexes(db) {
  await db.collection('bookings').createIndexes([
    {
      key: { patientId: 1, sessionId: 1 },
      name: 'booking_patient_session_unique',
      unique: true,
    },
    { key: { bookingCode: 1 }, name: 'booking_code_unique', unique: true },
  ]);
}
const unavailable = () =>
  new HttpError(
    409,
    'SESSION_UNAVAILABLE',
    'This OPD session is no longer available for booking.'
  );
const duplicate = () =>
  new HttpError(
    409,
    'BOOKING_ALREADY_EXISTS',
    'You already have a booking for this session.'
  );
function validSession(item) {
  return (
    item.hospitalId instanceof ObjectId &&
    item.serviceId instanceof ObjectId &&
    item.sessionDate instanceof Date &&
    Number.isFinite(item.sessionDate.getTime()) &&
    item.sessionDate.toISOString().endsWith('T00:00:00.000Z') &&
    typeof item.doctorOrTeam === 'string' &&
    item.doctorOrTeam.trim() &&
    ['startTime', 'endTime'].every(
      (key) =>
        typeof item[key] === 'string' &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item[key])
    ) &&
    item.endTime > item.startTime &&
    item.status === 'OPEN' &&
    Number.isSafeInteger(item.capacity) &&
    item.capacity > 0 &&
    Number.isSafeInteger(item.bookedCount) &&
    item.bookedCount >= 0
  );
}
export function createBookingRepository(
  db,
  client,
  {
    now = () => new Date(),
    makeCode = () => `OPD-${randomUUID().replaceAll('-', '').toUpperCase()}`,
  } = {}
) {
  return {
    list: (patientId, query) => readBookingList(db, patientId, query, now()),
    getDetails: (patientId, bookingId) =>
      readBookingDetails(db, patientId, bookingId),
    async create(patientId, sessionId) {
      const topology = await db.admin().command({ hello: 1 });
      if (!topology.setName && topology.msg !== 'isdbgrid')
        throw new HttpError(
          503,
          'BOOKING_UNAVAILABLE',
          'Booking requires a transaction-capable database.'
        );
      const transaction = client.startSession();
      const bookingId = new ObjectId();
      const bookingCode = makeCode();
      try {
        return await transaction.withTransaction(
          async () => {
            const options = { session: transaction };
            // Real writes lock the eligibility records against concurrent suspension/deactivation.
            // These private revisions also make concurrent bookings retry from a fresh snapshot.
            const patient = await db
              .collection('users')
              .findOneAndUpdate(
                { _id: patientId, role: 'PATIENT', status: 'ACTIVE' },
                { $inc: { bookingRevision: 1 } },
                { ...options, projection: { _id: 1 } }
              );
            if (!patient)
              throw new HttpError(
                403,
                'FORBIDDEN',
                'An active patient account is required.'
              );
            if (
              await db
                .collection('bookings')
                .findOne({ patientId, sessionId }, options)
            )
              throw duplicate();
            const opd = await db
              .collection('opdSessions')
              .findOne({ _id: sessionId }, options);
            if (!opd)
              throw new HttpError(404, 'NOT_FOUND', 'OPD session not found.');
            if (!validSession(opd)) throw unavailable();
            const hospital = await db
              .collection('hospitals')
              .findOneAndUpdate(
                { _id: opd.hospitalId, isActive: true },
                { $inc: { bookingRevision: 1 } },
                { ...options, projection: { _id: 1 } }
              );
            const service = await db.collection('opdServices').findOneAndUpdate(
              {
                _id: opd.serviceId,
                hospitalId: opd.hospitalId,
                isActive: true,
              },
              { $inc: { bookingRevision: 1 } },
              { ...options, projection: { _id: 1 } }
            );
            if (!hospital || !service) throw unavailable();
            const at = now(); // Refreshed on every transaction retry, immediately before reserving capacity.
            const eligible = await db.collection('opdSessions').findOne(
              {
                _id: sessionId,
                $expr: { $gt: [timestamp('startTime'), at] },
              },
              options
            );
            if (!eligible) throw unavailable();
            if (opd.bookedCount >= opd.capacity)
              throw new HttpError(
                409,
                'SESSION_FULL',
                'This OPD session is already full.'
              );
            const updated = await db.collection('opdSessions').updateOne(
              {
                _id: sessionId,
                status: 'OPEN',
                $expr: {
                  $and: [
                    { $lt: ['$bookedCount', '$capacity'] },
                    { $gt: [timestamp('startTime'), now()] },
                  ],
                },
              },
              { $inc: { bookedCount: 1 }, $set: { updatedAt: at } },
              options
            );
            if (updated.modifiedCount !== 1) throw unavailable();
            const booking = {
              _id: bookingId,
              bookingCode,
              patientId,
              sessionId,
              status: 'CONFIRMED',
              createdAt: at,
              updatedAt: at,
            };
            await db.collection('bookings').insertOne(booking, options);
            await insertBookingConfirmation(db, booking, transaction);
            return {
              ...booking,
              _id: bookingId.toString(),
              patientId: patientId.toString(),
              sessionId: sessionId.toString(),
              createdAt: at.toISOString(),
              updatedAt: at.toISOString(),
            };
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            readPreference: 'primary',
            maxCommitTimeMS: 5000,
            timeoutMS: 10000,
          }
        );
      } catch (error) {
        if (
          error.code === 11000 &&
          error.keyPattern?.patientId &&
          error.keyPattern?.sessionId
        )
          throw duplicate();
        throw error;
      } finally {
        await transaction.endSession();
      }
    },
  };
}
