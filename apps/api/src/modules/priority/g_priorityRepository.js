import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { writeAuditLog } from '../audit/g_auditLog.js';
import { insertNotification } from '../notifications/g_notificationRepository.js';
import { maskNic } from '../users/g_profileRepository.js';

export const PRIORITY_REASONS = ['ELDERLY', 'MOBILITY', 'PREGNANT', 'OTHER'];
const DECIDED = ['ACCEPTED', 'DECLINED'];
const LIST_LIMIT = 100;

export async function ensurePriorityIndexes(db) {
  await db
    .collection('priorityRequests')
    .createIndex(
      { status: 1, createdAt: 1 },
      { name: 'priority_status_created' }
    );
}

const text = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const iso = (value) => (value instanceof Date ? value.toISOString() : null);

// Requests whose booking or session no longer exists are left out of staff views.
function joined(match, hospitalId) {
  return [
    { $match: match },
    {
      $lookup: {
        from: 'bookings',
        localField: 'bookingId',
        foreignField: '_id',
        as: 'booking',
      },
    },
    { $unwind: '$booking' },
    {
      $lookup: {
        from: 'opdSessions',
        localField: 'booking.sessionId',
        foreignField: '_id',
        as: 'session',
      },
    },
    { $unwind: '$session' },
    ...(hospitalId ? [{ $match: { 'session.hospitalId': hospitalId } }] : []),
  ];
}

const details = [
  {
    $lookup: {
      from: 'opdServices',
      localField: 'session.serviceId',
      foreignField: '_id',
      as: 'service',
    },
  },
  {
    $lookup: {
      from: 'hospitals',
      localField: 'session.hospitalId',
      foreignField: '_id',
      as: 'hospital',
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'patientId',
      foreignField: '_id',
      as: 'patient',
    },
  },
  {
    $lookup: {
      from: 'queueEntries',
      localField: 'bookingId',
      foreignField: 'bookingId',
      as: 'queue',
    },
  },
];

function sessionSummary(session) {
  const sessionDate = iso(session.sessionDate)?.slice(0, 10) ?? null;
  const startTime = text(session.startTime);
  // Sessions are scheduled in Asia/Colombo, a fixed +05:30 offset.
  const startsAt =
    sessionDate && startTime
      ? new Date(`${sessionDate}T${startTime}:00+05:30`)
      : null;
  return {
    _id: session._id.toString(),
    sessionDate,
    startTime,
    endTime: text(session.endTime),
    startsAt:
      startsAt && Number.isFinite(startsAt.getTime())
        ? startsAt.toISOString()
        : null,
  };
}

function toPublic(request, { detailed = false } = {}) {
  const patient = request.patient[0] ?? {};
  return {
    _id: request._id.toString(),
    status: request.status,
    reason: PRIORITY_REASONS.includes(request.reason)
      ? request.reason
      : 'OTHER',
    note: text(request.note),
    decisionNote: text(request.decisionNote),
    createdAt: iso(request.createdAt),
    reviewedAt: iso(request.reviewedAt),
    patient: {
      fullName: text(patient.fullName) ?? 'Patient',
      // Contact details are returned only when one request is opened.
      ...(detailed
        ? { maskedNic: maskNic(patient.nic), phone: text(patient.phone) }
        : {}),
    },
    booking: {
      _id: request.booking._id.toString(),
      bookingCode: text(request.booking.bookingCode),
      status: request.booking.status,
    },
    service: { name: text(request.service[0]?.name) ?? 'OPD service' },
    hospital: { name: text(request.hospital[0]?.name) ?? 'Hospital' },
    session: sessionSummary(request.session),
    queuePriority: request.queue[0]?.priorityLevel ?? null,
  };
}

const notFound = () =>
  new HttpError(404, 'NOT_FOUND', 'Priority request not found.');

export function createPriorityRepository(db, { now = () => new Date() } = {}) {
  const requests = db.collection('priorityRequests');

  // Staff linked to a hospital only ever see that hospital's requests.
  async function hospitalScope(staffUserId) {
    const staff = await db
      .collection('users')
      .findOne(
        { _id: staffUserId },
        { projection: { hospitalId: 1 }, maxTimeMS: 3000 }
      );
    return staff?.hospitalId instanceof ObjectId ? staff.hospitalId : null;
  }

  async function count(match, hospitalId) {
    const [result] = await requests
      .aggregate([...joined(match, hospitalId), { $count: 'total' }], {
        maxTimeMS: 5000,
      })
      .toArray();
    return result?.total ?? 0;
  }

  async function read(requestId, hospitalId) {
    const [request] = await requests
      .aggregate([...joined({ _id: requestId }, hospitalId), ...details], {
        maxTimeMS: 5000,
      })
      .toArray();
    if (!request) throw notFound();
    return request;
  }

  return {
    async pendingCount(staffUserId) {
      return count({ status: 'PENDING' }, await hospitalScope(staffUserId));
    },

    async list(staffUserId, status) {
      const hospitalId = await hospitalScope(staffUserId);
      const pending = status === 'pending';
      const [items, pendingCount] = await Promise.all([
        requests
          .aggregate(
            [
              ...joined(
                { status: pending ? 'PENDING' : { $in: DECIDED } },
                hospitalId
              ),
              // Oldest pending request first; most recent decision first.
              { $sort: pending ? { createdAt: 1 } : { reviewedAt: -1 } },
              { $limit: LIST_LIMIT },
              ...details,
            ],
            { maxTimeMS: 5000 }
          )
          .toArray(),
        count({ status: 'PENDING' }, hospitalId),
      ]);
      return { items: items.map((item) => toPublic(item)), pendingCount };
    },

    async get(staffUserId, requestId) {
      const request = await read(requestId, await hospitalScope(staffUserId));
      return toPublic(request, { detailed: true });
    },

    async decide(staffUserId, requestId, { decision, decisionNote }) {
      const hospitalId = await hospitalScope(staffUserId);
      const request = await read(requestId, hospitalId);
      const at = now();
      // The PENDING filter makes the decision atomic: a second reviewer loses.
      const decided = await requests.findOneAndUpdate(
        { _id: requestId, status: 'PENDING' },
        {
          $set: {
            status: decision,
            reviewedById: staffUserId,
            reviewedAt: at,
            decisionNote: decisionNote ?? null,
            updatedAt: at,
          },
        },
        { returnDocument: 'after' }
      );
      if (!decided)
        throw new HttpError(
          409,
          'PRIORITY_REQUEST_ALREADY_DECIDED',
          'This request has already been decided.'
        );

      const accepted = decision === 'ACCEPTED';
      if (accepted)
        // A patient who has already checked in moves to the priority queue now.
        // Later check-ins read the accepted request for this booking.
        await db.collection('queueEntries').updateMany(
          {
            bookingId: request.bookingId,
            status: { $in: ['WAITING', 'CALLED'] },
          },
          { $set: { priorityLevel: 'APPROVED_PRIORITY', updatedAt: at } }
        );
      const bookingCode = text(request.booking.bookingCode) ?? 'your booking';
      await insertNotification(db, {
        userId: request.patientId,
        type: 'PRIORITY',
        title: accepted
          ? 'Priority request accepted'
          : 'Priority request declined',
        message: accepted
          ? `Reception accepted your priority request for ${bookingCode}. Report to the reception desk when you arrive.`
          : `Reception could not accept your priority request for ${bookingCode}. Your booking is still confirmed.`,
        data: {
          event: accepted
            ? 'PRIORITY_REQUEST_ACCEPTED'
            : 'PRIORITY_REQUEST_DECLINED',
          requestId,
          bookingId: request.bookingId,
        },
        createdAt: at,
      });
      await writeAuditLog(db, {
        actorUserId: staffUserId,
        action: accepted
          ? 'PRIORITY_REQUEST_ACCEPTED'
          : 'PRIORITY_REQUEST_DECLINED',
        entityType: 'priorityRequest',
        entityId: requestId,
        metadata: {
          bookingId: request.bookingId,
          patientId: request.patientId,
          decisionNote: decisionNote ?? null,
        },
        createdAt: at,
      });
      return toPublic(await read(requestId, hospitalId), { detailed: true });
    },
  };
}
