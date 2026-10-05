import { HttpError } from '../../utils/HttpError.js';
import { colomboDate, SESSION_TIME_ZONE } from '../hospitals/sessionQuery.js';
import { readStaffHospitalScope } from '../staff/k_staffHospitalScope.js';

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
