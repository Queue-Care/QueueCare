import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { colomboDate } from '../hospitals/sessionQuery.js';
import { requireStaff } from '../priority/g_priorityRoutes.js';

const SESSION_LIMIT = 20;

export function createStaffDashboardRepository(
  db,
  { priorityRepository, notificationRepository, now = () => new Date() } = {}
) {
  return {
    async summary(staffUserId) {
      const staff = await db
        .collection('users')
        .findOne({ _id: staffUserId }, { maxTimeMS: 3000 });
      if (!staff) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
      const at = now();
      const date = colomboDate(at);
      const hospitalId =
        staff.hospitalId instanceof ObjectId ? staff.hospitalId : null;
      const sessions = await db
        .collection('opdSessions')
        .find(
          {
            sessionDate: new Date(`${date}T00:00:00.000Z`),
            ...(hospitalId ? { hospitalId } : {}),
          },
          { maxTimeMS: 3000 }
        )
        .sort({ startTime: 1, _id: 1 })
        .limit(SESSION_LIMIT)
        .toArray();
      const sessionIds = sessions.map((session) => session._id);
      const [services, checkedIn, serving, priorityWaiting, unread] =
        await Promise.all([
          db
            .collection('opdServices')
            .find(
              { _id: { $in: sessions.map((session) => session.serviceId) } },
              { projection: { name: 1 } }
            )
            .toArray(),
          db.collection('bookings').countDocuments({
            sessionId: { $in: sessionIds },
            checkedInAt: { $type: 'date' },
          }),
          db
            .collection('queueEntries')
            .find({
              sessionId: { $in: sessionIds },
              status: { $in: ['CALLED', 'IN_CONSULTATION'] },
            })
            .sort({ calledAt: -1 })
            .limit(1)
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
        sessionsToday: todaysSessions.length,
        priorityWaiting,
        patientsCheckedIn: checkedIn,
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
