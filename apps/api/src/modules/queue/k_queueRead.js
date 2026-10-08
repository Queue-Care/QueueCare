import { ObjectId } from 'mongodb';

const date = value => value instanceof Date && Number.isFinite(value.getTime());
const same = (a, b) => a instanceof ObjectId && b instanceof ObjectId && a.equals(b);

// Historical terminal records retain their cumulative check-in after suspension.
// Active entries keep the exact M3-14 ACTIVE PATIENT/identity requirements.
export function validQueueEntry(entry, sessionId, { includeTerminal = false } = {}) {
  const booking = entry.booking[0], patient = entry.patient[0];
  const terminal = ['COMPLETED', 'SKIPPED'].includes(entry.status);
  return entry._id instanceof ObjectId && same(entry.sessionId, sessionId) &&
    Number.isSafeInteger(entry.queueNumber) && entry.queueNumber > 0 &&
    ['NORMAL', 'APPROVED_PRIORITY', 'EMERGENCY'].includes(entry.priorityLevel) &&
    (['WAITING', 'CALLED', 'IN_CONSULTATION'].includes(entry.status) || (includeTerminal && terminal)) &&
    date(entry.checkedInAt) && date(entry.updatedAt) && entry.updatedAt >= entry.checkedInAt &&
    booking && same(entry.bookingId, booking._id) && same(booking.sessionId, sessionId) &&
    same(entry.patientId, booking.patientId) && date(booking.checkedInAt) &&
    booking.checkedInAt.getTime() === entry.checkedInAt.getTime() &&
    patient && same(entry.patientId, patient._id) && patient.role === 'PATIENT' &&
    (terminal || (patient.status === 'ACTIVE' && typeof patient.fullName === 'string' &&
      patient.fullName.trim() && patient.fullName.length <= 120 && !/[\x00-\x1f\x7f]/.test(patient.fullName)));
}

export function queueEntriesLookup({ includeTerminal = false } = {}) {
  const statuses = ['WAITING', 'CALLED', 'IN_CONSULTATION', ...(includeTerminal ? ['COMPLETED', 'SKIPPED'] : [])];
  return { $lookup: { from: 'queueEntries', localField: '_id', foreignField: 'sessionId',
    pipeline: [
      { $match: { status: { $in: statuses } } },
      { $project: { bookingId: 1, patientId: 1, sessionId: 1, queueNumber: 1,
        priorityLevel: 1, status: 1, checkedInAt: 1, updatedAt: 1, calledAt: 1,
        assignedTime: 1, queueType: 1, slotIndex: 1 } },
      { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id',
        pipeline: [{ $project: { patientId: 1, sessionId: 1, checkedInAt: 1 } }], as: 'booking' } },
      { $lookup: { from: 'users', localField: 'patientId', foreignField: '_id',
        pipeline: [{ $project: { fullName: 1, role: 1, status: 1 } }], as: 'patient' } },
    ], as: 'entries' } };
}
