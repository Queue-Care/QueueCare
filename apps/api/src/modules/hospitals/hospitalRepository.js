import { buildHospitalFilter } from './hospitalQuery.js';

const collation = { locale: 'en', strength: 2 };
const projection = {
  _id: 1,
  name: 1,
  address: 1,
  city: 1,
  phone: 1,
  imageUrl: 1,
};

export async function ensureHospitalIndexes(db) {
  await db.collection('hospitals').createIndexes([
    {
      key: { isActive: 1, name: 1, _id: 1 },
      name: 'hospital_active_name',
      collation,
    },
    {
      key: { isActive: 1, city: 1, name: 1, _id: 1 },
      name: 'hospital_active_city_name',
      collation,
    },
  ]);
}

export function createHospitalRepository(db) {
  const collection = db.collection('hospitals');
  return {
    async search(query) {
      const filter = buildHospitalFilter(query);
      const [hospitals, total] = await Promise.all([
        collection
          .find(filter, { projection, maxTimeMS: 3000 })
          .collation(collation)
          .sort({ name: 1, _id: 1 })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .toArray(),
        collection.countDocuments(filter, { collation, maxTimeMS: 3000 }),
      ]);
      return {
        data: hospitals.map((hospital) => ({
          ...hospital,
          _id: hospital._id.toString(),
        })),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
          hasNextPage: query.page * query.limit < total,
        },
      };
    },
  };
}
