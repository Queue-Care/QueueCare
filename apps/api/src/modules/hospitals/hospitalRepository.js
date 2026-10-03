import { buildHospitalFilter } from './hospitalQuery.js';
import { HttpError } from '../../utils/HttpError.js';
import {
  ensureSessionIndexes,
  readHospitalSessions,
} from './hospitalSessions.js';

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
  await db
    .collection('opdServices')
    .createIndex(
      { hospitalId: 1, isActive: 1, name: 1, _id: 1 },
      { name: 'service_hospital_active_name', collation }
    );
  await ensureSessionIndexes(db);
}

export function createHospitalRepository(db, { now = () => new Date() } = {}) {
  const collection = db.collection('hospitals');
  async function findActiveHospital(hospitalId) {
    const hospital = await collection.findOne(
      { _id: hospitalId, isActive: true },
      { projection, maxTimeMS: 3000 }
    );
    // Inactive and missing hospitals have the same public response.
    if (!hospital) throw new HttpError(404, 'NOT_FOUND', 'Hospital not found.');
    return { ...hospital, _id: hospital._id.toString() };
  }
  return {
    getDetails: findActiveHospital,
    async getSessions(hospitalId, query) {
      const at = now();
      await findActiveHospital(hospitalId);
      return readHospitalSessions(db, hospitalId, query, at);
    },
    async getServices(hospitalId) {
      await findActiveHospital(hospitalId);
      const services = await db
        .collection('opdServices')
        .find(
          { hospitalId, isActive: true },
          {
            projection: { _id: 1, hospitalId: 1, name: 1 },
            maxTimeMS: 3000,
          }
        )
        .collation(collation)
        .sort({ name: 1, _id: 1 })
        .toArray();
      return services.map((service) => ({
        ...service,
        _id: service._id.toString(),
        hospitalId: service.hospitalId.toString(),
      }));
    },
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
