import { ObjectId } from 'mongodb';

// Real hospital names and areas, used as booking destinations in the academic demo.
// Seeded hours, services and sessions stay demo data; never real care information.
export const demoHospitals = [
  {
    _id: new ObjectId('000000000000000000000101'),
    name: 'National Hospital of Sri Lanka (NHSL)',
    openingHours:
      'Demo hours (Sri Lanka time):\nMonday–Friday: 08:00–17:00\nSaturday: 08:00–12:00\nSunday: Closed',
    city: 'Colombo',
    address: 'Colombo 10',
    isActive: true,
  },
  {
    _id: new ObjectId('000000000000000000000102'),
    name: 'Colombo North Teaching Hospital',
    city: 'Ragama',
    address: 'Ragama, Gampaha District',
    isActive: true,
  },
  {
    _id: new ObjectId('000000000000000000000103'),
    name: 'Apeksha Cancer Institute',
    city: 'Maharagama',
    address: 'Maharagama, Colombo District',
    isActive: true,
  },
  {
    _id: new ObjectId('000000000000000000000104'),
    name: 'National Institute of Nephrology Dialysis & Transplantation',
    city: 'Colombo',
    address: 'Maligawatta, Colombo 10',
    isActive: true,
  },
  {
    _id: new ObjectId('000000000000000000000105'),
    name: 'National Hospital for Respiratory Diseases (Chest Hospital)',
    city: 'Welisara',
    address: 'Welisara, Gampaha District',
    isActive: true,
  },
];

// Names the first three records were seeded with before the real hospitals replaced them.
const formerDemoNames = [
  'Demo Central Hospital',
  'Demo Lakeside Hospital',
  'Demo Southern Hospital',
];

export async function seedHospitals(db) {
  const now = new Date();
  // A record still carrying its untouched former demo name moves to the current one,
  // keeping its _id so linked services, sessions, bookings and staff stay attached.
  let renamedCount = 0;
  for (const [index, formerName] of formerDemoNames.entries()) {
    const { _id, name, city, address } = demoHospitals[index];
    const renamed = await db
      .collection('hospitals')
      .updateOne(
        { _id, name: formerName },
        { $set: { name, city, address, updatedAt: now } }
      );
    renamedCount += renamed.modifiedCount;
    // Staff accounts keep a copy of their hospital's name.
    await db
      .collection('users')
      .updateMany(
        { hospitalId: _id, hospital: formerName },
        { $set: { hospital: name, updatedAt: now } }
      );
  }
  // Insert missing demo records only. Never overwrite an existing hospital or edited seed.
  const result = await db.collection('hospitals').bulkWrite(
    demoHospitals.map((hospital) => ({
      updateOne: {
        filter: { _id: hospital._id },
        update: {
          $setOnInsert: { ...hospital, createdAt: now, updatedAt: now },
        },
        upsert: true,
      },
    }))
  );
  return { upsertedCount: result.upsertedCount, renamedCount };
}
