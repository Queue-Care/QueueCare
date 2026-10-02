import { ObjectId } from 'mongodb';

// Deliberately fictional locations for the academic demo; never real care information.
export const demoHospitals = [
  {
    _id: new ObjectId('000000000000000000000101'),
    name: 'Demo Central Hospital',
    city: 'Colombo',
    address: 'Demo location — not a real hospital',
    isActive: true,
  },
  {
    _id: new ObjectId('000000000000000000000102'),
    name: 'Demo Lakeside Hospital',
    city: 'Kandy',
    address: 'Demo location — not a real hospital',
    isActive: true,
  },
  {
    _id: new ObjectId('000000000000000000000103'),
    name: 'Demo Southern Hospital',
    city: 'Galle',
    address: 'Demo location — not a real hospital',
    isActive: true,
  },
];

export async function seedHospitals(db) {
  const now = new Date();
  // Insert missing demo records only. Never overwrite an existing hospital or edited seed.
  return db.collection('hospitals').bulkWrite(
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
}
