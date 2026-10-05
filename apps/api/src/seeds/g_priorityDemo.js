import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { colomboDate } from '../modules/hospitals/sessionQuery.js';
import { demoHospitals, seedHospitals } from './hospitals.js';
import { seedServices } from './services.js';
import { seedSessions } from './sessions.js';

const SEED_SOURCE = 'queuecare-demo';
const id = (key) =>
  new ObjectId(
    createHash('sha256')
      .update(`queuecare-demo-priority:v1:${key}`)
      .digest('hex')
      .slice(0, 24)
  );

// Fictional patients matching the Priority Requests prototype screen. Never real data.
const demoRequests = [
  {
    key: 'kasun',
    fullName: 'Kasun Perera',
    nic: '000000001234V',
    reason: 'ELDERLY',
    note: 'My father is 78 and cannot stand for long. We will arrive by 8:00 AM.',
  },
  {
    key: 'amaya',
    fullName: 'Amaya Silva',
    nic: '000000002345V',
    reason: 'MOBILITY',
    note: 'I use a wheelchair and need help reaching the consultation room.',
  },
  {
    key: 'ruwan',
    fullName: 'Ruwan Fernando',
    nic: '000000003456V',
    reason: 'OTHER',
    note: 'I am recovering from surgery and cannot sit for a long time.',
  },
  {
    key: 'dinithi',
    fullName: 'Dinithi Perera',
    nic: '000000004567V',
    reason: 'PREGNANT',
    note: null,
  },
  {
    key: 'ishara',
    fullName: 'Ishara Bandara',
    nic: '000000005678V',
    reason: 'ELDERLY',
    note: null,
    status: 'ACCEPTED',
  },
];

// Adds demo patients, bookings and priority requests for the first demo hospital,
// on today's sessions (Asia/Colombo). Existing records are preserved unless reset.
export async function seedPriorityDemo(
  db,
  { now = new Date(), reset = false } = {}
) {
  const date = colomboDate(now);
  await seedHospitals(db);
  await seedServices(db);
  await seedSessions(db, { now, date });
  const hospital = demoHospitals[0];
  const sessions = await db
    .collection('opdSessions')
    .find({
      hospitalId: hospital._id,
      sessionDate: new Date(`${date}T00:00:00.000Z`),
    })
    .sort({ startTime: 1, _id: 1 })
    .toArray();
  if (!sessions.length)
    throw new Error('No demo OPD sessions are available for today.');

  let inserted = 0;
  for (const [index, demo] of demoRequests.entries()) {
    const patientId = id(`patient:${demo.key}`);
    const bookingId = id(`booking:${demo.key}:${date}`);
    const requestId = id(`request:${demo.key}:${date}`);
    const session = sessions[index % sessions.length];
    const createdAt = new Date(now.getTime() - (index + 1) * 10 * 60 * 1000);
    await db.collection('users').updateOne(
      { _id: patientId },
      {
        $setOnInsert: {
          _id: patientId,
          role: 'PATIENT',
          fullName: demo.fullName,
          nic: demo.nic,
          mobile: `+947700000${String(index + 1).padStart(2, '0')}`,
          email: `${demo.key}.demo@queuecare.invalid`,
          status: 'ACTIVE',
          preferredLanguage: 'en',
          createdAt,
          updatedAt: createdAt,
          seedSource: SEED_SOURCE,
        },
      },
      { upsert: true }
    );
    const booking = await db.collection('bookings').updateOne(
      { _id: bookingId },
      {
        $setOnInsert: {
          _id: bookingId,
          bookingCode: `OPD-DEMO-${date.replaceAll('-', '')}-${index + 1}`,
          patientId,
          sessionId: session._id,
          status: 'CONFIRMED',
          createdAt,
          updatedAt: createdAt,
          seedSource: SEED_SOURCE,
        },
      },
      { upsert: true }
    );
    if (booking.upsertedCount)
      await db
        .collection('opdSessions')
        .updateOne({ _id: session._id }, { $inc: { bookedCount: 1 } });
    const decided = demo.status === 'ACCEPTED';
    const request = {
      status: demo.status ?? 'PENDING',
      reviewedById: null,
      reviewedAt: decided ? createdAt : null,
      decisionNote: null,
      updatedAt: createdAt,
    };
    const result = await db.collection('priorityRequests').updateOne(
      { _id: requestId },
      {
        $setOnInsert: {
          _id: requestId,
          bookingId,
          patientId,
          reason: demo.reason,
          note: demo.note,
          createdAt,
          seedSource: SEED_SOURCE,
          ...(reset ? {} : request),
        },
        // A reset returns only these demo requests to their starting state.
        ...(reset ? { $set: request } : {}),
      },
      { upsert: true }
    );
    inserted += result.upsertedCount;
  }
  return { inserted, total: demoRequests.length, date, hospital: hospital.name };
}
