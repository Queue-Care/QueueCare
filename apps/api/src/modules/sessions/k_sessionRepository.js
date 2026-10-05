import { HttpError } from '../../utils/HttpError.js';
import { ObjectId } from 'mongodb';
import { colomboDate, SESSION_TIME_ZONE } from '../hospitals/sessionQuery.js';
import { readStaffHospitalScope } from '../staff/k_staffHospitalScope.js';
import { writeAuditLog } from '../audit/g_auditLog.js';

// Only public management fields are projected. Queue metrics can be added later
// without changing identity/date fields or exposing the underlying document.
const summary = [
  {
    $lookup: {
      from: 'opdServices',
      let: { serviceId: '$serviceId', hospitalId: '$hospitalId' },
      pipeline: [
        { $match: { $expr: { $and: [
          { $eq: ['$_id', '$$serviceId'] },
          { $eq: ['$hospitalId', '$$hospitalId'] },
        ] } } },
        { $project: { _id: 0, name: 1 } },
      ],
      as: 'service',
    },
  },
  { $project: {
    _id: 1, hospitalId: 1, serviceId: 1, doctorOrTeam: 1,
    sessionDate: 1, startTime: 1, endTime: 1, capacity: 1,
    bookedCount: 1, status: 1,
    serviceName: { $ifNull: [{ $arrayElemAt: ['$service.name', 0] }, null] },
  } },
];

function toPublic(item) {
  if (!(item.sessionDate instanceof Date) || !Number.isFinite(item.sessionDate.getTime()) ||
      !item.sessionDate.toISOString().endsWith('T00:00:00.000Z'))
    throw new HttpError(409, 'SESSION_DETAILS_UNAVAILABLE', 'The saved session date is unavailable.');
  return {
    _id: item._id.toString(),
    hospitalId: item.hospitalId.toString(),
    serviceId: item.serviceId?.toString() ?? null,
    serviceName: item.serviceName,
    doctorOrTeam: item.doctorOrTeam ?? null,
    sessionDate: item.sessionDate.toISOString().slice(0, 10),
    startTime: item.startTime ?? null,
    endTime: item.endTime ?? null,
    capacity: item.capacity ?? null,
    bookedCount: item.bookedCount ?? null,
    status: item.status ?? null,
  };
}

export function createStaffSessionRepository(db, { now = () => new Date() } = {}) {
  return {
    async create(staffUserId, input) {
      const hospitalId = await readStaffHospitalScope(db, staffUserId);
      const topology = await db.admin().command({ hello: 1 });
      if (!topology.setName && topology.msg !== 'isdbgrid')
        throw new HttpError(503, 'SESSION_CREATION_UNAVAILABLE',
          'Session creation requires a transaction-capable database.');
      const transaction = db.client.startSession();
      const sessionId = new ObjectId();
      try {
        return await transaction.withTransaction(async () => {
          const options = { session: transaction, maxTimeMS: 3000 };
          const hospital = await db.collection('hospitals').findOne(
            { _id: hospitalId, isActive: true }, options
          );
          if (!hospital)
            throw new HttpError(403, 'FORBIDDEN', 'An active linked hospital is required to create sessions.');
          const service = await db.collection('opdServices').findOne(
            { _id: input.serviceId, hospitalId, isActive: true }, options
          );
          // Unknown, inactive and other-hospital services share one safe error.
          if (!service || typeof service.name !== 'string' || !service.name.trim())
            throw new HttpError(400, 'VALIDATION_ERROR', 'Check the session details.',
              { serviceId: 'Choose an active service in your hospital.' });
          const at = now(); // Recheck scheduling on transaction retries.
          const date = input.sessionDate.toISOString().slice(0, 10);
          const startsAt = new Date(`${date}T${input.startTime}:00+05:30`);
          if (startsAt <= at)
            throw new HttpError(400, 'VALIDATION_ERROR', 'Check the session details.',
              { sessionDate: 'Session start must be in the future in Asia/Colombo.' });
          const item = {
            _id: sessionId, hospitalId, serviceId: input.serviceId,
            doctorOrTeam: input.doctorOrTeam, sessionDate: input.sessionDate,
            startTime: input.startTime, endTime: input.endTime, capacity: input.capacity,
            bookedCount: 0, status: 'OPEN', createdById: staffUserId,
            createdAt: at, updatedAt: at,
          };
          await db.collection('opdSessions').insertOne(item, options);
          await writeAuditLog(db, {
            actorUserId: staffUserId, action: 'SESSION_CREATED', entityType: 'opdSession',
            entityId: sessionId, metadata: { hospitalId, serviceId: input.serviceId },
            createdAt: at,
          }, options);
          return toPublic({ ...item, serviceName: service.name });
        }, {
          readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
          readPreference: 'primary', maxCommitTimeMS: 5000, timeoutMS: 10000,
        });
      } finally {
        await transaction.endSession();
      }
    },
    async list(staffUserId, query) {
      const hospitalId = await readStaffHospitalScope(db, staffUserId);
      const date = query.date ?? colomboDate(now());
      const day = new Date(`${date}T00:00:00.000Z`);
      const match = {
        hospitalId,
        sessionDate: query.view === 'upcoming' ? { $gt: day } : day,
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        ...(query.status ? { status: query.status } : {}),
      };
      const rows = await db.collection('opdSessions').aggregate([
        { $match: match },
        // Reject malformed day markers before sorting/pagination. Guard the
        // date operator so strings, arrays and missing values cannot fail reads.
        { $match: { $expr: { $cond: [
          { $eq: [{ $type: '$sessionDate' }, 'date'] },
          { $eq: ['$sessionDate', { $dateTrunc: {
            date: '$sessionDate', unit: 'day', timezone: 'UTC',
          } }] },
          false,
        ] } } },
        { $sort: { sessionDate: 1, startTime: 1, _id: 1 } },
        { $skip: (query.page - 1) * query.limit },
        { $limit: query.limit + 1 },
        ...summary,
      ], { maxTimeMS: 3000 }).toArray();
      return {
        data: rows.slice(0, query.limit).map(toPublic),
        meta: {
          view: query.view ?? 'date', date, timeZone: SESSION_TIME_ZONE,
          page: query.page, limit: query.limit, hasMore: rows.length > query.limit,
        },
      };
    },
    async get(staffUserId, sessionId) {
      const hospitalId = await readStaffHospitalScope(db, staffUserId);
      const item = await db.collection('opdSessions').aggregate([
        { $match: { _id: sessionId, hospitalId } },
        ...summary,
      ], { maxTimeMS: 3000 }).next();
      // Unknown and other-hospital IDs have the same response.
      if (!item) throw new HttpError(404, 'NOT_FOUND', 'OPD session not found.');
      return toPublic(item);
    },
  };
}
