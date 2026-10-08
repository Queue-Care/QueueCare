import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { readAvailableSlots, noPrioritySlots } from '../bookings/appointmentSlots.js';
import { insertNotification } from '../notifications/g_notificationRepository.js';

function toPatient(request) {
  return {
    _id: request._id.toString(), bookingId: request.bookingId.toString(),
    reason: request.reason, status: request.status, createdAt: request.createdAt.toISOString(),
    ...(request.note ? { note: request.note } : {}),
    ...(request.decisionNote ? { decisionNote: request.decisionNote } : {}),
    ...(request.decisionCode ? { decisionCode: request.decisionCode } : {}),
  };
}

export async function ensurePatientPriorityIndexes(db) {
  await db.collection('priorityRequests').createIndex({ bookingId: 1 }, {
    name: 'priority_booking_active_unique', unique: true,
    partialFilterExpression: { status: { $in: ['PENDING', 'ACCEPTED'] } },
  });
  await db.collection('priorityRequests').createIndex({ patientId: 1, createdAt: -1 }, { name: 'priority_patient_recent' });
}

export function createPatientPriorityRepository(db, { now = () => new Date() } = {}) {
  const requests = db.collection('priorityRequests');
  return {
    async create(patientId, { bookingId, reason, note }) {
      const transaction = db.client.startSession();
      try { return await transaction.withTransaction(async () => {
          const options = { session: transaction, maxTimeMS: 3000 };
          const booking = await db.collection('bookings').findOneAndUpdate({ _id: bookingId, patientId }, { $inc: { slotRevision: 1 } }, options);
          if (!booking) throw new HttpError(404, 'NOT_FOUND', 'Booking not found.');
          if (booking.status !== 'CONFIRMED') throw new HttpError(409, 'BOOKING_NOT_CONFIRMED', 'Priority assistance requires a confirmed booking.');
          const session = await db.collection('opdSessions').findOneAndUpdate({ _id: booking.sessionId }, { $inc: { slotRevision: 1 } }, options);
          if (!session || !['OPEN', 'CLOSED', 'RUNNING'].includes(session.status))
            throw new HttpError(409, 'SESSION_UNAVAILABLE', 'This appointment is no longer eligible for priority assistance.');
          const at = now();
          if (!(session.sessionDate instanceof Date) || typeof session.endTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(session.endTime))
            throw new HttpError(409, 'SESSION_UNAVAILABLE', 'This appointment is unavailable.');
          const end = new Date(`${session.sessionDate.toISOString().slice(0, 10)}T${session.endTime}:00+05:30`);
          if (end <= at) throw new HttpError(409, 'SESSION_ENDED', 'This appointment has already ended.');
          if (await requests.findOne({ bookingId, status: { $in: ['PENDING', 'ACCEPTED'] } }, options))
            throw new HttpError(409, 'PRIORITY_REQUEST_EXISTS', 'A priority request is already pending or accepted for this booking.');
          const available = (await readAvailableSlots(db, session, options)).some(s => s.queueType === 'PRIORITY' && s.assignedTime > at);
          const request = {
            _id: new ObjectId(), bookingId, patientId, reason, status: available ? 'PENDING' : 'DECLINED',
            ...(!available ? { decisionCode: 'NO_PRIORITY_SLOT_AVAILABLE', decisionNote: noPrioritySlots, reviewedAt: at } : {}),
            ...(note ? { note } : {}), createdAt: at, updatedAt: at,
          };
          try { await requests.insertOne(request, options); }
          catch (error) {
            if (error.code === 11000) throw new HttpError(409, 'PRIORITY_REQUEST_EXISTS', 'A priority request is already pending or accepted for this booking.');
            throw error;
          }
          if (!available) await insertNotification(db, { userId: patientId, type: 'PRIORITY', title: 'No priority slots available',
            message: noPrioritySlots, data: { event: 'PRIORITY_REQUEST_DECLINED', bookingId, requestId: request._id, decisionCode: 'NO_PRIORITY_SLOT_AVAILABLE' }, createdAt: at }, options);
          if (available) {
            // Hospital membership comes from the booked session, never patient input.
            const staff = await db.collection('users').find({
              hospitalId: session.hospitalId, status: 'ACTIVE',
              role: { $in: ['RECEPTION', 'NURSE', 'ADMIN'] },
            }, { ...options, projection: { _id: 1 } }).toArray();
            for (const member of staff) await insertNotification(db, {
              userId: member._id, type: 'PRIORITY', title: 'New priority request',
              message: `A patient requested priority assistance for booking ${booking.bookingCode}. Review the request in Priority requests.`,
              data: { event: 'PRIORITY_REQUEST_SUBMITTED', requestId: request._id,
                bookingId, sessionId: session._id, hospitalId: session.hospitalId }, createdAt: at,
            }, options);
          }
          return toPatient(request);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', timeoutMS: 10000 });
      } finally { await transaction.endSession(); }
    },
    async list(patientId) {
      const items = await requests.find({ patientId }, { maxTimeMS: 3000 })
        .sort({ createdAt: -1, _id: -1 }).limit(100).toArray();
      return items.map(toPatient);
    },
  };
}
