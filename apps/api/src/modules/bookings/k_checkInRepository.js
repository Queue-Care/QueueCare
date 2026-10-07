import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { colomboDate } from '../hospitals/sessionQuery.js';
import { readStaffHospitalScope } from '../staff/k_staffHospitalScope.js';
import { writeAuditLog } from '../audit/g_auditLog.js';

const conflict = () => new HttpError(409, 'CHECK_IN_CONFLICT', 'Stored check-in records are inconsistent.');
const ineligible = () => new HttpError(409, 'CHECK_IN_NOT_ALLOWED', 'This booking is not eligible for check-in.');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Booking not found.');
const date = value => value instanceof Date && Number.isFinite(value.getTime());
const sameId = (a, b) => a instanceof ObjectId && b instanceof ObjectId && a.equals(b);
const priorities = ['NORMAL', 'APPROVED_PRIORITY', 'EMERGENCY'];
const statuses = ['WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'SKIPPED'];
const toPublic = entry => ({ bookingId: entry.bookingId.toString(), sessionId: entry.sessionId.toString(),
  queueNumber: entry.queueNumber, priorityLevel: entry.priorityLevel, status: entry.status,
  checkedInAt: entry.checkedInAt.toISOString(), updatedAt: entry.updatedAt.toISOString() });

export function createCheckInRepository(db, { now = () => new Date() } = {}) {
  return {
    async checkIn(staffUserId, bookingId) {
      const hospitalId = await readStaffHospitalScope(db, staffUserId);
      const topology = await db.admin().command({ hello: 1 });
      if (!topology.setName && topology.msg !== 'isdbgrid')
        throw new HttpError(503, 'CHECK_IN_UNAVAILABLE', 'Check-in requires a transaction-capable database.');
      const transaction = db.client.startSession();
      try {
        return await transaction.withTransaction(async () => {
          const options = { session: transaction, maxTimeMS: 3000 };
          // Real writes guard scope against concurrent suspension/reassignment/deactivation.
          const staff = await db.collection('users').findOneAndUpdate(
            { _id: staffUserId, hospitalId, status: 'ACTIVE', role: { $in: ['RECEPTION', 'NURSE', 'ADMIN'] } },
            { $inc: { checkInRevision: 1 } }, { ...options, projection: { _id: 1 } }
          );
          const hospital = await db.collection('hospitals').findOneAndUpdate(
            { _id: hospitalId, isActive: true }, { $inc: { checkInRevision: 1 } },
            { ...options, projection: { _id: 1 } }
          );
          if (!staff || !hospital)
            throw new HttpError(403, 'FORBIDDEN', 'An active linked hospital staff account is required.');
          const booking = await db.collection('bookings').findOne({ _id: bookingId }, options);
          if (!booking) throw notFound();
          if (!(booking.sessionId instanceof ObjectId) || !(booking.patientId instanceof ObjectId)) throw conflict();
          const session = await db.collection('opdSessions').findOne({ _id: booking.sessionId }, options);
          if (!session || !sameId(session.hospitalId, hospitalId)) throw notFound();
          const patient = await db.collection('users').findOne({ _id: booking.patientId }, options);
          if (!patient || patient.role !== 'PATIENT') throw conflict();
          const existing = await db.collection('queueEntries').findOne({ bookingId }, options);
          if (existing) {
            if (!sameId(existing.bookingId, bookingId) || !sameId(existing.sessionId, booking.sessionId) ||
                !sameId(existing.patientId, booking.patientId) ||
                !date(booking.checkedInAt) || !date(existing.checkedInAt) ||
                booking.checkedInAt.getTime() !== existing.checkedInAt.getTime() ||
                !Number.isSafeInteger(existing.queueNumber) || existing.queueNumber < 1 ||
                !priorities.includes(existing.priorityLevel) || !statuses.includes(existing.status) ||
                !date(existing.createdAt) || !date(existing.updatedAt) || existing.updatedAt < existing.checkedInAt)
              throw conflict();
            return toPublic(existing);
          }
          if (booking.checkedInAt !== undefined && booking.checkedInAt !== null) throw conflict();
          const at = now();
          if (booking.status !== 'CONFIRMED' || patient.status !== 'ACTIVE' ||
              !['OPEN', 'CLOSED', 'RUNNING'].includes(session.status) ||
              !date(session.sessionDate) || !session.sessionDate.toISOString().endsWith('T00:00:00.000Z') ||
              session.sessionDate.toISOString().slice(0, 10) !== colomboDate(at)) throw ineligible();
          await db.collection('users').updateOne(
            { _id: booking.patientId, role: 'PATIENT', status: 'ACTIVE' }, { $inc: { checkInRevision: 1 } }, options
          );
          // This real session write serializes allocation. Conflicts retry all reads
          // from a fresh snapshot, including the queue maximum and replay check.
          await db.collection('opdSessions').updateOne(
            { _id: session._id, hospitalId }, { $inc: { checkInRevision: 1 } }, options
          );
          const highest = await db.collection('queueEntries').find(
            { sessionId: session._id, $expr: { $cond: [
              { $isNumber: '$queueNumber' }, { $and: [
                { $gt: ['$queueNumber', 0] }, { $lte: ['$queueNumber', Number.MAX_SAFE_INTEGER] },
                { $eq: ['$queueNumber', { $trunc: '$queueNumber' }] },
              ] }, false,
            ] } }, { ...options, projection: { queueNumber: 1 } }
          ).sort({ queueNumber: -1 }).limit(1).next();
          if (highest && (!Number.isSafeInteger(highest.queueNumber) || highest.queueNumber < 1 ||
              highest.queueNumber >= Number.MAX_SAFE_INTEGER)) throw conflict();
          // Accepted state is read in this transaction; teammate priority decisions
          // are separate multi-step writes, so simultaneous acceptance is not atomic.
          const accepted = await db.collection('priorityRequests').findOne(
            { bookingId, patientId: booking.patientId, status: 'ACCEPTED',
              $expr: { $and: [
                { $eq: ['$bookingId', bookingId] }, { $eq: ['$patientId', booking.patientId] },
                { $eq: ['$status', 'ACCEPTED'] },
              ] } }, options
          );
          const entry = { _id: new ObjectId(), bookingId, sessionId: session._id, patientId: booking.patientId,
            queueNumber: highest ? highest.queueNumber + 1 : 1,
            priorityLevel: accepted ? 'APPROVED_PRIORITY' : 'NORMAL', status: 'WAITING',
            checkedInAt: at, createdAt: at, updatedAt: at };
          await db.collection('bookings').updateOne(
            { _id: bookingId, status: 'CONFIRMED' }, { $set: { checkedInAt: at, updatedAt: at } }, options
          );
          await db.collection('queueEntries').insertOne(entry, options);
          await writeAuditLog(db, { actorUserId: staffUserId, action: 'BOOKING_CHECKED_IN', entityType: 'booking',
            entityId: bookingId, metadata: { hospitalId, sessionId: session._id, queueNumber: entry.queueNumber },
            createdAt: at }, options);
          return toPublic(entry);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
          readPreference: 'primary', maxCommitTimeMS: 5000, timeoutMS: 10000 });
      } finally { await transaction.endSession(); }
    },
  };
}
