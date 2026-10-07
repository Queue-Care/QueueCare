import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { colomboDate } from '../hospitals/sessionQuery.js';
import { requireStaff } from '../priority/g_priorityRoutes.js';
import { readStaffHospitalScope } from './k_staffHospitalScope.js';

const SESSION_LIMIT = 20;

export function createStaffDashboardRepository(
  db,
  { priorityRepository, notificationRepository, now = () => new Date() } = {}
) {
  return {
    async summary(staffUserId) {
      const hospitalId = await readStaffHospitalScope(db, staffUserId);
      const hospital = await db.collection('hospitals').findOne(
        { _id: hospitalId, isActive: true }, { projection: { _id: 1 }, maxTimeMS: 3000 }
      );
      if (!hospital) throw new HttpError(403, 'FORBIDDEN', 'An active linked hospital is required.');
      const staff = await db
        .collection('users')
        .findOne({ _id: staffUserId, hospitalId, status: 'ACTIVE' }, { maxTimeMS: 3000 });
      if (!staff) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
      const at = now();
      const date = colomboDate(at);
      const today = { hospitalId, sessionDate: new Date(`${date}T00:00:00.000Z`),
        $expr: { $eq: [{ $type: '$sessionDate' }, 'date'] } };
      // Join against all of today's hospital sessions, independently of the
      // dashboard's display limit and without building an unbounded ID array.
      const inTodaysSessions = [
        { $lookup: { from: 'opdSessions', localField: 'sessionId', foreignField: '_id',
          pipeline: [{ $match: today }, { $project: { _id: 1 } }], as: 'session' } },
        { $match: { 'session.0': { $exists: true } } },
      ];
      const sessions = await db
        .collection('opdSessions')
        .find(
          today,
          { maxTimeMS: 3000 }
        )
        .sort({ startTime: 1, _id: 1 })
        .limit(SESSION_LIMIT)
        .toArray();
      const [sessionsToday, services, checkedIn, serving, priorityWaiting, unread] =
        await Promise.all([
          db.collection('opdSessions').countDocuments(today, { maxTimeMS: 3000 }),
          db
            .collection('opdServices')
            .find(
              { hospitalId, _id: { $in: sessions.map((session) => session.serviceId) } },
              { projection: { name: 1 }, maxTimeMS: 3000 }
            )
            .toArray(),
          db.collection('bookings').aggregate([
            { $match: { checkedInAt: { $type: 'date' } } },
            ...inTodaysSessions, { $count: 'total' },
          ], { maxTimeMS: 3000 }).next(),
          db
            .collection('queueEntries')
            .aggregate([
              { $match: { status: { $in: ['CALLED', 'IN_CONSULTATION'] } } },
              ...inTodaysSessions,
              { $sort: { calledAt: -1, _id: -1 } }, { $limit: 1 },
              { $project: { queueNumber: 1 } },
            ], { maxTimeMS: 3000 })
            .next(),
          priorityRepository.pendingCount(staffUserId),
          notificationRepository.unreadCount(staffUserId),
        ]);
      const serviceNames = new Map(
        services.map((service) => [service._id.toString(), service.name])
      );

      // The server labels each session so the app never derives queue state itself.
      let nextFound = false;
      const todaysSessions = sessions.map((session) => {
        const time = (value) => new Date(`${date}T${value}:00+05:30`);
        const startsAt = time(session.startTime);
        const endsAt = time(session.endTime);
        let label;
        if (session.status === 'CANCELLED') label = 'Cancelled';
        else if (session.status === 'COMPLETED' || at >= endsAt)
          label = 'Ended';
        else if (session.status === 'RUNNING' || at >= startsAt)
          label = 'Running';
        else if (!nextFound) {
          label = 'Next';
          nextFound = true;
        } else label = 'Later';
        return {
          _id: session._id.toString(),
          serviceName:
            serviceNames.get(session.serviceId?.toString()) ?? 'OPD service',
          startTime: session.startTime,
          endTime: session.endTime,
          startsAt: Number.isFinite(startsAt.getTime())
            ? startsAt.toISOString()
            : null,
          capacity: session.capacity,
          bookedCount: session.bookedCount,
          status: session.status,
          label,
        };
      });

      return {
        staff: {
          fullName: staff.fullName,
          staffId: staff.staffId ?? null,
          hospital: staff.hospital ?? null,
          role: staff.role,
          profileImageUrl: staff.profileImageUrl ?? null,
        },
        date,
        sessionsToday,
        priorityWaiting,
        patientsCheckedIn: checkedIn?.total ?? 0,
        nowServing: Number.isInteger(serving?.queueNumber)
          ? `A-${String(serving.queueNumber).padStart(3, '0')}`
          : null,
        unreadNotifications: unread,
        sessions: todaysSessions,
      };
    },
  };
}

export function staffDashboardRoutes(repository, authenticate) {
  const router = Router();
  router.get('/', authenticate, requireStaff, async (request, response) => {
    const fieldErrors = Object.fromEntries(Object.keys(request.query).map(key =>
      [key, 'Unsupported query parameter.']));
    if (Object.keys(fieldErrors).length)
      throw new HttpError(400, 'VALIDATION_ERROR', 'Check the dashboard request.', fieldErrors);
    if (!repository)
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'The reception dashboard is unavailable.'
      );
    const data = await repository.summary(request.auth.userId);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });
  return router;
}
