import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import {
  colomboDate,
  isSessionDate,
} from '../modules/hospitals/sessionQuery.js';
import { demoHospitals } from './hospitals.js';
import { demoServices } from './services.js';

export function tomorrowInColombo(now = new Date()) {
  const day = new Date(`${colomboDate(now)}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
export async function seedSessions(
  db,
  { now = new Date(), date = tomorrowInColombo(now) } = {}
) {
  if (!isSessionDate(date))
    throw new Error('Demo session date must be YYYY-MM-DD.');
  const hospitals = await db
    .collection('hospitals')
    .find(
      { _id: { $in: demoHospitals.map((item) => item._id) }, isActive: true },
      { projection: { _id: 1 } }
    )
    .toArray();
  const services = await db
    .collection('opdServices')
    .find(
      {
        _id: { $in: demoServices.map((item) => item._id) },
        hospitalId: { $in: hospitals.map((item) => item._id) },
        isActive: true,
      },
      { projection: { _id: 1, hospitalId: 1 } }
    )
    .toArray();
  const operations = services
    .filter((service) =>
      demoServices.some(
        (item) =>
          item._id.equals(service._id) &&
          item.hospitalId.equals(service.hospitalId)
      )
    )
    .flatMap((service) =>
      [
        ['09:00', '10:00'],
        ['11:00', '12:00'],
      ].map(([startTime, endTime]) => {
        const key = `queuecare-demo-session:v1:${service._id}:${date}:${startTime}`;
        const _id = new ObjectId(
          createHash('sha256').update(key).digest('hex').slice(0, 24)
        );
        return {
          updateOne: {
            filter: { _id },
            update: {
              $setOnInsert: {
                _id,
                hospitalId: service.hospitalId,
                serviceId: service._id,
                doctorOrTeam: 'Demo OPD team',
                sessionDate: new Date(`${date}T00:00:00.000Z`),
                startTime,
                endTime,
                capacity: 20,
                bookedCount: 0,
                status: 'OPEN',
                createdAt: now,
                updatedAt: now,
                // System seed has no staff author; future authenticated staff writes must supply createdById.
                seedSource: 'queuecare-demo',
              },
            },
            upsert: true,
          },
        };
      })
    );
  const result = operations.length
    ? await db.collection('opdSessions').bulkWrite(operations)
    : { upsertedCount: 0 };
  return { upsertedCount: result.upsertedCount, date };
}
