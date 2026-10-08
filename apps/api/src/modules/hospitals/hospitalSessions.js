import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { colomboDate, SESSION_TIME_ZONE } from './sessionQuery.js';
import { readAvailableSlots } from '../bookings/appointmentSlots.js';

export async function ensureSessionIndexes(db) {
  await db
    .collection('opdSessions')
    .createIndex(
      {
        hospitalId: 1,
        status: 1,
        sessionDate: 1,
        serviceId: 1,
        startTime: 1,
        _id: 1,
      },
      { name: 'session_hospital_status_date_service' }
    );
}

// The caller verifies the hospital is active. All reads are public projections.
export async function readHospitalSessions(db, hospitalId, query, now) {
  const date = query.date ?? colomboDate(now);
  const services = await db
    .collection('opdServices')
    .find(
      {
        hospitalId,
        isActive: true,
        ...(query.serviceId ? { _id: query.serviceId } : {}),
      },
      { projection: { _id: 1, name: 1 }, maxTimeMS: 3000 }
    )
    .toArray();
  if (query.serviceId && !services.length)
    throw new HttpError(
      404,
      'NOT_FOUND',
      'Service not found for this hospital.'
    );
  const serviceNames = new Map(
    services.map((service) => [service._id.toString(), service.name])
  );
  const timestamp = (field) => ({
    $dateFromString: {
      dateString: {
        $concat: [
          date,
          'T',
          {
            $convert: {
              input: `$${field}`,
              to: 'string',
              onError: null,
              onNull: null,
            },
          },
          ':00',
        ],
      },
      format: '%Y-%m-%dT%H:%M:%S',
      timezone: SESSION_TIME_ZONE,
      onError: null,
      onNull: null,
    },
  });
  const rows = services.length
    ? await db
        .collection('opdSessions')
        .aggregate(
          [
            {
              $match: {
                hospitalId,
                status: 'OPEN',
                sessionDate: new Date(`${date}T00:00:00.000Z`),
                serviceId: { $in: services.map((service) => service._id) },
                $expr: {
                  $and: [
                    { $eq: [{ $type: '$sessionDate' }, 'date'] },
                    { $eq: [{ $type: '$status' }, 'string'] },
                  ],
                },
              },
            },
            {
              $set: {
                startsAt: timestamp('startTime'),
                endsAt: timestamp('endTime'),
              },
            },
            {
              $match: {
                startsAt: { $gt: now },
                $expr: { $gt: ['$endsAt', '$startsAt'] },
              },
            },
            { $sort: { startsAt: 1, _id: 1 } },
            {
              $project: {
                _id: 1,
                hospitalId: 1,
                serviceId: 1,
                doctorOrTeam: 1,
                startTime: 1,
                endTime: 1,
                startsAt: 1,
                endsAt: 1,
                capacity: 1,
                bookedCount: 1,
              },
            },
          ],
          { maxTimeMS: 3000 }
        )
        .toArray()
    : [];
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const data = rows
    .filter(
      (row) =>
        row._id instanceof ObjectId &&
        row.hospitalId instanceof ObjectId &&
        row.serviceId instanceof ObjectId &&
        typeof row.doctorOrTeam === 'string' &&
        row.doctorOrTeam.trim() &&
        typeof serviceNames.get(row.serviceId.toString()) === 'string' &&
        serviceNames.get(row.serviceId.toString()).trim() &&
        typeof row.startTime === 'string' &&
        time.test(row.startTime) &&
        typeof row.endTime === 'string' &&
        time.test(row.endTime) &&
        Number.isSafeInteger(row.capacity) &&
        row.capacity > 0 &&
        Number.isSafeInteger(row.bookedCount) &&
        row.bookedCount >= 0
    )
    .map((row) => {
      const remainingCapacity = Math.max(0, row.capacity - row.bookedCount);
      return {
        _id: row._id.toString(),
        hospitalId: row.hospitalId.toString(),
        serviceId: row.serviceId.toString(),
        serviceName: serviceNames.get(row.serviceId.toString()),
        doctorOrTeam: row.doctorOrTeam,
        sessionDate: date,
        startTime: row.startTime,
        endTime: row.endTime,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: 'OPEN',
        capacity: row.capacity,
        bookedCount: row.bookedCount,
        remainingCapacity,
        isBookable: remainingCapacity > 0,
      };
    });
  // Total capacity includes reserved positions. The patient may only book a
  // normal position; priority availability is checked separately at review.
  for (const item of data) {
    let normalRemainingCapacity = 0;
    try {
      const slots = await readAvailableSlots(db, { ...item,
        _id: new ObjectId(item._id), sessionDate: new Date(`${date}T00:00:00Z`) }, { maxTimeMS: 3000 });
      normalRemainingCapacity = Math.min(item.remainingCapacity, slots.filter(s => s.queueType === 'NORMAL').length);
    } catch (error) { if (error.code !== 'SLOT_CONFLICT') throw error; }
    item.normalRemainingCapacity = normalRemainingCapacity;
    item.isBookable = normalRemainingCapacity > 0;
  }
  return {
    data,
    meta: {
      date,
      timeZone: SESSION_TIME_ZONE,
      total: data.length,
      bookableCount: data.filter((session) => session.isBookable).length,
    },
  };
}
