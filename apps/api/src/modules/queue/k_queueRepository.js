import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { readStaffHospitalScope } from '../staff/k_staffHospitalScope.js';
import { buildQueueSnapshot } from './k_queueService.js';

const date = value => value instanceof Date && Number.isFinite(value.getTime());
const same = (a, b) => a instanceof ObjectId && b instanceof ObjectId && a.equals(b);
function valid(entry, sessionId) {
  const booking = entry.booking[0], patient = entry.patient[0];
  return entry._id instanceof ObjectId && same(entry.sessionId, sessionId) &&
    Number.isSafeInteger(entry.queueNumber) && entry.queueNumber > 0 &&
    ['NORMAL', 'APPROVED_PRIORITY', 'EMERGENCY'].includes(entry.priorityLevel) &&
    ['WAITING', 'CALLED', 'IN_CONSULTATION'].includes(entry.status) &&
    date(entry.checkedInAt) && date(entry.updatedAt) && entry.updatedAt >= entry.checkedInAt &&
    booking && same(entry.bookingId, booking._id) && same(booking.sessionId, sessionId) &&
    same(entry.patientId, booking.patientId) && date(booking.checkedInAt) &&
    booking.checkedInAt.getTime() === entry.checkedInAt.getTime() &&
    patient && same(entry.patientId, patient._id) && patient.role === 'PATIENT' && patient.status === 'ACTIVE' &&
    typeof patient.fullName === 'string' && patient.fullName.trim() && patient.fullName.length <= 120 &&
    !/[\x00-\x1f\x7f]/.test(patient.fullName);
}

export function createQueueRepository(db) {
  return {
    async getStaffSnapshot(staffUserId, sessionId) {
      const hospitalId = await readStaffHospitalScope(db, staffUserId);
      const hospital = await db.collection('hospitals').findOne(
        { _id: hospitalId, isActive: true }, { projection: { _id: 1 }, maxTimeMS: 3000 }
      );
      if (!hospital) throw new HttpError(403, 'FORBIDDEN', 'An active linked hospital is required.');
      // One aggregation includes the session and all joined queue records. No
      // pagination or separate rank queries can truncate the computed positions.
      const snapshot = await db.collection('opdSessions').aggregate([
        { $match: { _id: sessionId, hospitalId, $expr: { $eq: ['$hospitalId', hospitalId] } } },
        { $project: { _id: 1 } },
        { $lookup: { from: 'queueEntries', localField: '_id', foreignField: 'sessionId',
          pipeline: [
            { $match: { status: { $in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] } } },
            { $project: { bookingId: 1, patientId: 1, sessionId: 1, queueNumber: 1,
              priorityLevel: 1, status: 1, checkedInAt: 1, updatedAt: 1 } },
            { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id',
              pipeline: [{ $project: { patientId: 1, sessionId: 1, checkedInAt: 1 } }], as: 'booking' } },
            { $lookup: { from: 'users', localField: 'patientId', foreignField: '_id',
              pipeline: [{ $project: { fullName: 1, role: 1, status: 1 } }], as: 'patient' } },
          ], as: 'entries' } },
      ], { maxTimeMS: 3000 }).next();
      if (!snapshot) throw new HttpError(404, 'NOT_FOUND', 'OPD session not found.');
      const entries = snapshot.entries.filter(entry => valid(entry, sessionId)).map(entry =>
        ({ ...entry, fullName: entry.patient[0].fullName }));
      return buildQueueSnapshot(sessionId, entries);
    },
  };
}
