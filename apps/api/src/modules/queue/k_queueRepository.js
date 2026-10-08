import { HttpError } from '../../utils/HttpError.js';
import { readStaffHospitalScope } from '../staff/k_staffHospitalScope.js';
import { buildQueueSnapshot } from './k_queueService.js';
import { validQueueEntry, queueEntriesLookup } from './k_queueRead.js';
import { calculateSlots } from '../bookings/appointmentSlots.js';

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
        { $project: { _id: 1, sessionDate: 1, startTime: 1, endTime: 1, capacity: 1 } },
        queueEntriesLookup(),
      ], { maxTimeMS: 3000 }).next();
      if (!snapshot) throw new HttpError(404, 'NOT_FOUND', 'OPD session not found.');
      const entries = snapshot.entries.filter(entry => validQueueEntry(entry, sessionId)).map(entry =>
        ({ ...entry, fullName: entry.patient[0].fullName }));
      // Older queue-only fixtures can lack a scheduling grid. Preserve their
      // existing estimate; valid configured sessions use the dynamic interval.
      let interval;
      try { interval = calculateSlots(snapshot)[0].slotIntervalMinutes; }
      catch (error) { if (error.code !== 'SLOT_CONFIGURATION_INVALID') throw error; }
      return buildQueueSnapshot(sessionId, entries, interval);
    },
  };
}
