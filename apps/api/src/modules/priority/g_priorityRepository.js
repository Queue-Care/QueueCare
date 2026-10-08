import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { writeAuditLog } from '../audit/g_auditLog.js';
import { insertNotification } from '../notifications/g_notificationRepository.js';
import { readAvailableSlots, slotFields, noPrioritySlots } from '../bookings/appointmentSlots.js';
import { maskNic } from '../users/g_profileRepository.js';
import { readStaffHospitalScope } from '../staff/k_staffHospitalScope.js';

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
        ? {
            maskedNic: maskNic(patient.nic),
            phone: text(patient.mobile) ?? text(patient.phone),
          }
        : {}),
    },
    booking: {
      _id: request.booking._id.toString(),
      bookingCode: text(request.booking.bookingCode),
      status: request.booking.status,
      assignedTime: iso(request.booking.assignedTime),
      queueType: request.booking.queueType ?? null,
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
    return readStaffHospitalScope(db, staffUserId);
  }

  async function count(match, hospitalId) {
    const [result] = await requests
      .aggregate([...joined(match, hospitalId), { $count: 'total' }], {
        maxTimeMS: 5000,
      })
      .toArray();
    return result?.total ?? 0;
  }

  async function read(requestId, hospitalId, options = {}) {
    const [request] = await requests
      .aggregate([...joined({ _id: requestId }, hospitalId), ...details], {
        maxTimeMS: 5000, ...options,
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
      const transaction = db.client.startSession();
      try {
        await transaction.withTransaction(async () => {
          const options = { session: transaction, maxTimeMS: 5000 };
          const request = await read(requestId, hospitalId, options);
          if (request.status !== 'PENDING')
            throw new HttpError(409, 'PRIORITY_REQUEST_ALREADY_DECIDED', 'This request has already been decided.');
          const at = now();
          let status = decision, note = decisionNote ?? null, slot, decisionCode;
          if (decision === 'ACCEPTED') {
            const session = await db.collection('opdSessions').findOneAndUpdate(
              { _id: request.session._id, hospitalId: request.session.hospitalId,
                status: { $in: ['OPEN', 'CLOSED', 'RUNNING'] } },
              { $inc: { slotRevision: 1 } }, { ...options, returnDocument: 'after' });
            const booking = await db.collection('bookings').findOneAndUpdate(
              { _id: request.bookingId, patientId: request.patientId, status: 'CONFIRMED' },
              { $inc: { slotRevision: 1 } }, { ...options, returnDocument: 'after' });
            if (!session || !booking)
              throw new HttpError(409, 'PRIORITY_BOOKING_UNAVAILABLE', 'This booking or session is no longer eligible for priority assistance.');
            const queue = await db.collection('queueEntries').findOne({ bookingId: booking._id }, options);
            if (queue && queue.status !== 'WAITING')
              throw new HttpError(409, 'PRIORITY_BOOKING_UNAVAILABLE', 'A patient who has already been called cannot be reassigned.');
            slot = (await readAvailableSlots(db, session, options))
              .find(s => s.queueType === 'PRIORITY' && s.assignedTime > at);
            if (!slot) { status = 'DECLINED'; note = noPrioritySlots; decisionCode = 'NO_PRIORITY_SLOT_AVAILABLE'; }
            else {
              await db.collection('bookings').updateOne({ _id: booking._id, status: 'CONFIRMED' },
                { $set: { ...slotFields(slot), updatedAt: at } }, options);
              await db.collection('queueEntries').updateMany({ bookingId: booking._id, status: 'WAITING' },
                { $set: { ...slotFields(slot), priorityLevel: 'APPROVED_PRIORITY', updatedAt: at } }, options);
            }
          }
          const decided = await requests.updateOne({ _id: requestId, status: 'PENDING' },
            { $set: { status, decisionNote: note, ...(decisionCode ? { decisionCode } : {}),
              reviewedById: staffUserId, reviewedAt: at, updatedAt: at } }, options);
          if (!decided.modifiedCount)
            throw new HttpError(409, 'PRIORITY_REQUEST_ALREADY_DECIDED', 'This request has already been decided.');
          const accepted = status === 'ACCEPTED';
          const service = text(request.service[0]?.name) ?? 'OPD';
          const appointment = slot?.assignedTime.toLocaleString('en-GB', { timeZone: 'Asia/Colombo' });
          await insertNotification(db, { userId: request.patientId, type: 'PRIORITY',
            title: accepted ? 'Priority request accepted' : 'Priority request declined',
            message: accepted
              ? `Your priority request has been accepted. OPD: ${service} / ${request.session.doctorOrTeam}. Date and priority appointment time: ${appointment} (Sri Lanka time).`
              : note ?? 'Reception could not accept your priority request. Your normal appointment remains confirmed.',
            data: { event: accepted ? 'PRIORITY_REQUEST_ACCEPTED' : 'PRIORITY_REQUEST_DECLINED',
              requestId, bookingId: request.bookingId, ...(slot ? slotFields(slot) : {}),
              ...(decisionCode ? { decisionCode } : {}) }, createdAt: at }, options);
          await writeAuditLog(db, { actorUserId: staffUserId,
            action: accepted ? 'PRIORITY_REQUEST_ACCEPTED' : 'PRIORITY_REQUEST_DECLINED',
            entityType: 'priorityRequest', entityId: requestId,
            metadata: { bookingId: request.bookingId, decisionNote: note, decisionCode: decisionCode ?? null }, createdAt: at }, options);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
          readPreference: 'primary', maxCommitTimeMS: 5000, timeoutMS: 10000 });
      } finally { await transaction.endSession(); }
      return toPublic(await read(requestId, hospitalId), { detailed: true });
    },
  };
}
