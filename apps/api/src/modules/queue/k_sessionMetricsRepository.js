import { HttpError } from '../../utils/HttpError.js';
import { readStaffHospitalScope } from '../staff/k_staffHospitalScope.js';
import { validQueueEntry, queueEntriesLookup } from './k_queueRead.js';
import { assertQueueIntegrity } from './k_queueService.js';

export function createSessionMetricsRepository(db) {
  return {
    async get(staffUserId, sessionId) {
      const hospitalId = await readStaffHospitalScope(db, staffUserId);
      const hospital = await db.collection('hospitals').findOne(
        { _id: hospitalId, isActive: true }, { projection: { _id: 1 }, maxTimeMS: 3000 }
      );
      if (!hospital) throw new HttpError(403, 'FORBIDDEN', 'An active linked hospital is required.');
      const session = await db.collection('opdSessions').aggregate([
        { $match: { _id: sessionId, hospitalId, $expr: { $eq: ['$hospitalId', hospitalId] } } },
        { $project: { status: 1, capacity: 1, bookedCount: 1 } },
        queueEntriesLookup({ includeTerminal: true }),
      ], { maxTimeMS: 3000 }).next();
      if (!session) throw new HttpError(404, 'NOT_FOUND', 'OPD session not found.');
      if (!['OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'].includes(session.status) ||
          !Number.isSafeInteger(session.capacity) || session.capacity <= 0 ||
          !Number.isSafeInteger(session.bookedCount) || session.bookedCount < 0 || session.bookedCount > session.capacity)
        throw new HttpError(409, 'SESSION_METRICS_CONFLICT', 'Stored session metrics are inconsistent.');
      const entries = session.entries.filter(entry => validQueueEntry(entry, sessionId, { includeTerminal: true }));
      assertQueueIntegrity(entries);
      const waiting = entries.filter(entry => entry.status === 'WAITING');
      const serving = entries.filter(entry => ['CALLED', 'IN_CONSULTATION'].includes(entry.status));
      const called = serving.filter(entry => entry.calledAt instanceof Date && Number.isFinite(entry.calledAt.getTime()))
        .sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime() || b._id.toString().localeCompare(a._id.toString()));
      return { sessionId: sessionId.toString(), status: session.status, capacity: session.capacity,
        bookedCount: session.bookedCount, waitingCount: waiting.length, servingCount: serving.length,
        priorityCount: waiting.filter(entry => entry.priorityLevel !== 'NORMAL').length,
        patientsCheckedIn: entries.length,
        nowServing: called.length ? `A-${String(called[0].queueNumber).padStart(3, '0')}` : null };
    },
  };
}
