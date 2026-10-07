import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

function toPatient(request) {
  return {
    _id: request._id.toString(), bookingId: request.bookingId.toString(),
    reason: request.reason, status: request.status, createdAt: request.createdAt.toISOString(),
    ...(request.note ? { note: request.note } : {}),
    ...(request.decisionNote ? { decisionNote: request.decisionNote } : {}),
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
      const booking = await db.collection('bookings').findOne({ _id: bookingId, patientId }, { maxTimeMS: 3000 });
      if (!booking) throw new HttpError(404, 'NOT_FOUND', 'Booking not found.');
      if (booking.status !== 'CONFIRMED') throw new HttpError(409, 'BOOKING_NOT_CONFIRMED', 'Priority assistance requires a confirmed booking.');
      const session = await db.collection('opdSessions').findOne({ _id: booking.sessionId }, { maxTimeMS: 3000 });
      if (!session || !['OPEN', 'CLOSED', 'RUNNING'].includes(session.status))
        throw new HttpError(409, 'SESSION_UNAVAILABLE', 'This appointment is no longer eligible for priority assistance.');
      const at = now();
      if (!(session.sessionDate instanceof Date) || typeof session.endTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(session.endTime))
        throw new HttpError(409, 'SESSION_UNAVAILABLE', 'This appointment is unavailable.');
      const end = new Date(`${session.sessionDate.toISOString().slice(0, 10)}T${session.endTime}:00+05:30`);
      if (end <= at) throw new HttpError(409, 'SESSION_ENDED', 'This appointment has already ended.');
      const request = {
        _id: new ObjectId(), bookingId, patientId, reason, status: 'PENDING',
        ...(note ? { note } : {}), createdAt: at, updatedAt: at,
      };
      try { await requests.insertOne(request); }
      catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'PRIORITY_REQUEST_EXISTS', 'A priority request is already pending or accepted for this booking.');
        throw error;
      }
      return toPatient(request);
    },
    async list(patientId) {
      const items = await requests.find({ patientId }, { maxTimeMS: 3000 })
        .sort({ createdAt: -1, _id: -1 }).limit(100).toArray();
      return items.map(toPatient);
    },
  };
}
