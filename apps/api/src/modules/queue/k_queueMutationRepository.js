import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { colomboDate } from '../hospitals/sessionQuery.js';
import { readStaffHospitalScope } from '../staff/k_staffHospitalScope.js';
import { writeAuditLog } from '../audit/g_auditLog.js';
import { validQueueEntry } from './k_queueRead.js';
import { compareQueueEntries, assertQueueIntegrity } from './k_queueService.js';
import { QUEUE_MUTATION_ROLES } from './k_queueMutationValidation.js';

const transitions = { WAITING: ['SKIPPED'], CALLED: ['IN_CONSULTATION', 'SKIPPED'],
  IN_CONSULTATION: ['COMPLETED', 'SKIPPED'], COMPLETED: [], SKIPPED: [] };
const date = value => value instanceof Date && Number.isFinite(value.getTime());
const terminal = status => ['COMPLETED', 'SKIPPED'].includes(status);
const conflict = () => new HttpError(409, 'QUEUE_CONFLICT', 'Stored queue records are inconsistent.');
const forbidden = () => new HttpError(403, 'FORBIDDEN', 'An active linked hospital doctor or administrator is required.');
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Queue resource not found.');
const publicEntry = entry => ({ queueEntryId: entry._id.toString(), bookingId: entry.bookingId.toString(),
  sessionId: entry.sessionId.toString(), queueNumber: entry.queueNumber, priorityLevel: entry.priorityLevel,
  status: entry.status, checkedInAt: entry.checkedInAt.toISOString(), calledAt: entry.calledAt?.toISOString() ?? null,
  completedAt: entry.completedAt?.toISOString() ?? null, updatedAt: entry.updatedAt.toISOString() });

function consistent(entry, sessionId) {
  if (!validQueueEntry(entry, sessionId, { includeTerminal: true }) ||
      !date(entry.createdAt) || entry.createdAt > entry.checkedInAt ||
      entry.booking[0].status !== (terminal(entry.status) ? entry.status : 'CONFIRMED')) return false;
  if (entry.calledAt != null && (!date(entry.calledAt) || entry.calledAt < entry.checkedInAt || entry.calledAt > entry.updatedAt)) return false;
  if (['CALLED', 'IN_CONSULTATION', 'COMPLETED'].includes(entry.status) && !date(entry.calledAt)) return false;
  if (entry.status === 'WAITING' && entry.calledAt != null) return false;
  if (entry.status === 'COMPLETED')
    return date(entry.completedAt) && entry.completedAt >= entry.calledAt && entry.completedAt <= entry.updatedAt;
  return entry.completedAt == null;
}

export function createQueueMutationRepository(db, { now = () => new Date() } = {}) {
  async function mutate(actorId, resourceId, targetStatus, callNext) {
    const hospitalId = await readStaffHospitalScope(db, actorId, { roles: QUEUE_MUTATION_ROLES });
    const topology = await db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== 'isdbgrid')
      throw new HttpError(503, 'QUEUE_MUTATION_UNAVAILABLE', 'Queue updates require a transaction-capable database.');
    const transaction = db.client.startSession();
    try {
      return await transaction.withTransaction(async () => {
        const options = { session: transaction, maxTimeMS: 3000 };
        const actor = await db.collection('users').findOne(
          { _id: actorId, hospitalId, status: 'ACTIVE', role: { $in: QUEUE_MUTATION_ROLES } }, options);
        const hospital = await db.collection('hospitals').findOne({ _id: hospitalId, isActive: true }, options);
        if (!actor || actor.status !== 'ACTIVE' || !QUEUE_MUTATION_ROLES.includes(actor.role) ||
            !(actor.hospitalId instanceof ObjectId) || !actor.hospitalId.equals(hospitalId) ||
            hospital?.isActive !== true) throw forbidden();
        const requested = callNext ? null : await db.collection('queueEntries').findOne({ _id: resourceId }, options);
        if (!callNext && !requested) throw notFound();
        if (!callNext && !(requested.sessionId instanceof ObjectId)) throw conflict();
        const session = await db.collection('opdSessions').findOne(
          { _id: callNext ? resourceId : requested.sessionId, hospitalId }, options);
        if (!session || !(session.hospitalId instanceof ObjectId) || !session.hospitalId.equals(hospitalId)) throw notFound();
        if (!['OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'].includes(session.status) ||
            !date(session.sessionDate) || !session.sessionDate.toISOString().endsWith('T00:00:00.000Z')) throw conflict();
        // Keep full timestamps/booking status for mutation validation; share the
        // authoritative relationship validator and comparator with M3-14/15.
        const entries = await db.collection('queueEntries').aggregate([
          { $match: { sessionId: session._id } },
          { $lookup: { from: 'bookings', localField: 'bookingId', foreignField: '_id',
            pipeline: [{ $project: { patientId: 1, sessionId: 1, checkedInAt: 1, status: 1 } }], as: 'booking' } },
          { $lookup: { from: 'users', localField: 'patientId', foreignField: '_id',
            pipeline: [{ $project: { fullName: 1, role: 1, status: 1 } }], as: 'patient' } },
        ], options).toArray();
        if (entries.some(entry => !consistent(entry, session._id))) throw conflict();
        assertQueueIntegrity(entries);
        const serving = entries.filter(entry => ['CALLED', 'IN_CONSULTATION'].includes(entry.status));
        if (serving.length > 1) throw conflict();
        let entry;
        if (callNext) {
          if (serving.length) throw new HttpError(409, 'QUEUE_SERVING_CONFLICT', 'A patient is already being served.');
          entry = entries.filter(entry => entry.status === 'WAITING').sort(compareQueueEntries)[0];
          targetStatus = 'CALLED';
        } else {
          entry = entries.find(item => item._id.equals(resourceId));
          if (!entry) throw conflict();
          if (entry.status === targetStatus && terminal(entry.status)) return publicEntry(entry);
        }
        const at = now();
        if (!date(at) || !['OPEN', 'CLOSED', 'RUNNING'].includes(session.status) ||
            !date(session.sessionDate) || !session.sessionDate.toISOString().endsWith('T00:00:00.000Z') ||
            session.sessionDate.toISOString().slice(0, 10) !== colomboDate(at))
          throw new HttpError(409, 'QUEUE_MUTATION_NOT_ALLOWED', 'This session is not eligible for queue updates.');
        if (!entry) return null;
        if (entry.status === targetStatus) return publicEntry(entry);
        if (!callNext && !transitions[entry.status].includes(targetStatus))
          throw new HttpError(409, 'QUEUE_TRANSITION_NOT_ALLOWED', 'This queue status transition is not allowed.');
        if (at < entry.updatedAt) throw conflict();
        // Real writes establish shared conflict points with check-in, session
        // updates and concurrent scope changes. Empty/replay requests never write.
        const guardedActor = await db.collection('users').updateOne(
          { _id: actorId, hospitalId, status: 'ACTIVE', role: { $in: QUEUE_MUTATION_ROLES } },
          { $inc: { queueMutationRevision: 1 } }, options);
        const guardedHospital = await db.collection('hospitals').updateOne(
          { _id: hospitalId, isActive: true }, { $inc: { queueMutationRevision: 1 } }, options);
        if (!guardedActor.matchedCount || !guardedHospital.matchedCount) throw forbidden();
        const guardedSession = await db.collection('opdSessions').updateOne(
          { _id: session._id, hospitalId, status: session.status, sessionDate: session.sessionDate },
          { $inc: { queueMutationRevision: 1 } }, options);
        if (!guardedSession.matchedCount) throw conflict();
        const patient = await db.collection('users').updateOne(
          { _id: entry.patientId, role: 'PATIENT', status: 'ACTIVE' },
          { $inc: { queueMutationRevision: 1 } }, options);
        if (!patient.matchedCount) throw conflict();
        const changes = { status: targetStatus, updatedAt: at };
        if (callNext) changes.calledAt = at;
        if (targetStatus === 'COMPLETED') changes.completedAt = at;
        const changed = await db.collection('queueEntries').updateOne(
          { _id: entry._id, sessionId: session._id, status: entry.status }, { $set: changes }, options);
        if (!changed.matchedCount) throw conflict();
        // A real booking write also guards concurrent cancellation/rescheduling.
        const booking = await db.collection('bookings').updateOne(
          { _id: entry.bookingId, patientId: entry.patientId, sessionId: session._id, status: 'CONFIRMED' },
          terminal(targetStatus) ? { $set: { status: targetStatus, updatedAt: at } } : { $inc: { queueMutationRevision: 1 } }, options);
        if (!booking.matchedCount) throw conflict();
        await writeAuditLog(db, { actorUserId: actorId,
          action: callNext ? 'QUEUE_PATIENT_CALLED' : 'QUEUE_STATUS_UPDATED', entityType: 'queueEntry', entityId: entry._id,
          metadata: { hospitalId, sessionId: session._id, bookingId: entry.bookingId, queueEntryId: entry._id,
            previousStatus: entry.status, newStatus: targetStatus }, createdAt: at }, options);
        return publicEntry({ ...entry, ...changes });
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
        readPreference: 'primary', maxCommitTimeMS: 5000, timeoutMS: 10000 });
    } finally { await transaction.endSession(); }
  }
  return { callNext: (actorId, sessionId) => mutate(actorId, sessionId, 'CALLED', true),
    updateStatus: (actorId, entryId, status) => mutate(actorId, entryId, status, false) };
}
