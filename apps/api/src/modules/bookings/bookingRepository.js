import { randomInt } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { sessionTimestamp as timestamp } from './sessionTime.js';
import { readBookingDetails } from './bookingDetails.js';
import { insertBookingConfirmation } from './bookingNotification.js';
import { readBookingList } from './bookingList.js';
import { writeAuditLog } from '../audit/g_auditLog.js';
import { readAvailableSlots, slotFields } from './appointmentSlots.js';

export async function ensureBookingIndexes(db) {
  await db.collection('bookings').createIndexes([
    {
      key: { patientId: 1, sessionId: 1 },
      name: 'booking_patient_session_unique',
      unique: true,
    },
    { key: { bookingCode: 1 }, name: 'booking_code_unique', unique: true },
    { key: { sessionId: 1, slotIndex: 1 }, name: 'booking_active_slot_unique', unique: true,
      partialFilterExpression: { slotIndex: { $type: 'number' }, status: { $in: ['CONFIRMED', 'COMPLETED', 'SKIPPED', 'RESCHEDULED'] } } },
  ]);
}
const unavailable = () =>
  new HttpError(
    409,
    'SESSION_UNAVAILABLE',
    'This OPD session is no longer available for booking.'
  );
const notEditable = () =>
  new HttpError(
    409,
    'BOOKING_NOT_EDITABLE',
    'This booking can no longer be cancelled.'
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
// Short codes are read aloud at reception, so omit look-alike characters (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_ATTEMPTS = 5;
export function makeBookingCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `OPD-${code}`;
}
export function createBookingRepository(
  db,
  client,
  { now = () => new Date(), makeCode = makeBookingCode } = {}
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
      for (let attempt = 1; ; attempt++) {
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
              const service = await db
                .collection('opdServices')
                .findOneAndUpdate(
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
                  'This session is fully booked.'
                );
              const slot = (await readAvailableSlots(db, opd, options)).find(s => s.queueType === 'NORMAL');
              if (!slot) throw new HttpError(409, 'SESSION_FULL', 'All normal appointment slots are booked. Priority slots remain reserved.');
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
                ...slotFields(slot),
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
                assignedTime: slot.assignedTime.toISOString(),
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
          // A random short code can collide with an existing one; the transaction
          // rolled back, so retry with a new code.
          if (
            error.code === 11000 &&
            error.keyPattern?.bookingCode &&
            attempt < CODE_ATTEMPTS
          )
            continue;
          throw error;
        } finally {
          await transaction.endSession();
        }
      }
    },
    // README section 19: cancellation releases capacity atomically and is audited.
    // Repeating a cancel returns the saved booking without releasing capacity again.
    async cancel(patientId, bookingId) {
      const topology = await db.admin().command({ hello: 1 });
      if (!topology.setName && topology.msg !== 'isdbgrid')
        throw new HttpError(
          503,
          'BOOKING_UNAVAILABLE',
          'Cancellation requires a transaction-capable database.'
        );
      const transaction = client.startSession();
      try {
        await transaction.withTransaction(
          async () => {
            const options = { session: transaction };
            const booking = await db
              .collection('bookings')
              .findOne({ _id: bookingId, patientId }, options);
            // Missing and another patient's booking have the same response.
            if (!booking)
              throw new HttpError(404, 'NOT_FOUND', 'Booking not found.');
            if (booking.status === 'CANCELLED') return;
            if (
              booking.status !== 'CONFIRMED' ||
              (booking.checkedInAt !== undefined &&
                booking.checkedInAt !== null) ||
              !(booking.sessionId instanceof ObjectId)
            )
              throw notEditable();
            const at = now();
            const upcoming = await db.collection('opdSessions').findOne(
              {
                _id: booking.sessionId,
                $expr: { $gt: [timestamp('startTime'), at] },
              },
              options
            );
            if (!upcoming) throw notEditable();
            // The status filter also conflicts with a concurrent check-in write.
            const updated = await db
              .collection('bookings')
              .updateOne(
                {
                  _id: bookingId,
                  patientId,
                  status: 'CONFIRMED',
                  checkedInAt: null,
                },
                { $set: { status: 'CANCELLED', updatedAt: at } },
                options
              );
            if (updated.modifiedCount !== 1) throw notEditable();
            await db
              .collection('opdSessions')
              .updateOne(
                { _id: booking.sessionId, bookedCount: { $gt: 0 } },
                { $inc: { bookedCount: -1 }, $set: { updatedAt: at } },
                options
              );
            await writeAuditLog(
              db,
              {
                actorUserId: patientId,
                action: 'BOOKING_CANCELLED',
                entityType: 'booking',
                entityId: bookingId,
                metadata: { sessionId: booking.sessionId },
                createdAt: at,
              },
              options
            );
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            readPreference: 'primary',
            maxCommitTimeMS: 5000,
            timeoutMS: 10000,
          }
        );
      } finally {
        await transaction.endSession();
      }
      return readBookingDetails(db, patientId, bookingId);
    },
  };
}
