import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

// Resolve membership from the current database account, never request parameters.
export async function readStaffHospitalScope(db, staffUserId, { roles = ['RECEPTION', 'NURSE', 'ADMIN'] } = {}) {
  const staff = await db.collection('users').findOne(
    { _id: staffUserId, status: 'ACTIVE', role: { $in: roles } },
    { projection: { hospitalId: 1 }, maxTimeMS: 3000 }
  );
  if (!(staff?.hospitalId instanceof ObjectId)) throw unavailableScope();
  const hospital = await db.collection('hospitals').findOne(
    { _id: staff.hospitalId },
    { projection: { _id: 1 }, maxTimeMS: 3000 }
  );
  if (!hospital) throw unavailableScope();
  return staff.hospitalId;
}

function unavailableScope() {
  return new HttpError(403, 'FORBIDDEN', 'A linked hospital staff account is required.');
}
