import { ObjectId } from 'mongodb';
import { demoHospitals } from './hospitals.js';

// These services belong only to the fictional demo hospitals.
export const demoServices = demoHospitals.flatMap((hospital, index) =>
  ['General OPD', 'Medical clinic'].map((name, serviceIndex) => ({
    _id: new ObjectId(
      (0x201 + index * 2 + serviceIndex).toString(16).padStart(24, '0')
    ),
    hospitalId: hospital._id,
    name,
    isActive: true,
  }))
);

export async function seedServices(db) {
  const parents = await db
    .collection('hospitals')
    .find(
      {
        _id: { $in: demoHospitals.map((hospital) => hospital._id) },
        isActive: true,
      },
      { projection: { _id: 1 } }
    )
    .toArray();
  const activeIds = new Set(parents.map((hospital) => hospital._id.toString()));
  const services = demoServices.filter((service) =>
    activeIds.has(service.hospitalId.toString())
  );
  if (!services.length) return { upsertedCount: 0 };
  const now = new Date();
  return db.collection('opdServices').bulkWrite(
    services.map((service) => ({
      updateOne: {
        filter: { _id: service._id },
        update: {
          $setOnInsert: { ...service, createdAt: now, updatedAt: now },
        },
        upsert: true,
      },
    }))
  );
}
