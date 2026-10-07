import { ObjectId } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';
import { escapeRegex } from '../hospitals/hospitalQuery.js';
import { maskNic } from '../users/g_profileRepository.js';
import { readStaffHospitalScope } from './k_staffHospitalScope.js';

export function createStaffPatientSearchRepository(db) {
  return {
    async search(staffUserId, q) {
      const hospitalId = await readStaffHospitalScope(db, staffUserId);
      const hospital = await db.collection('hospitals').findOne(
        { _id: hospitalId, isActive: true }, { projection: { _id: 1 }, maxTimeMS: 3000 }
      );
      if (!hospital)
        throw new HttpError(403, 'FORBIDDEN', 'An active linked hospital is required.');
      const matches = [
        { nic: q.toUpperCase() },
        { fullName: { $regex: escapeRegex(q), $options: 'i' } },
      ];
      if (/^[a-f\d]{24}$/i.test(q)) matches.push({ _id: new ObjectId(q) });
      const patients = await db.collection('users').aggregate([
        { $match: { role: 'PATIENT', status: 'ACTIVE', _id: { $type: 'objectId' },
          $expr: { $and: [
            { $eq: [{ $type: '$role' }, 'string'] }, { $eq: [{ $type: '$status' }, 'string'] },
            { $eq: [{ $type: '$fullName' }, 'string'] },
            { $in: [{ $type: '$nic' }, ['string', 'null', 'missing']] },
            { $lte: [{ $strLenCP: { $convert: { input: '$fullName', to: 'string', onError: '', onNull: '' } } }, 120] },
          ] },
          fullName: { $type: 'string', $regex: /\S/, $not: /[\x00-\x1f\x7f]/ },
          $and: [
            { $or: matches },
            { $or: [{ nic: { $exists: false } }, { nic: { $type: 'null' } },
              { nic: { $type: 'string', $regex: /^(\d{12}|\d{9}[VX])$/ } }] },
          ] } },
        // Project identity only before joins; credentials never enter the result pipeline.
        { $project: { fullName: 1, nic: 1 } },
        { $lookup: { from: 'bookings', localField: '_id', foreignField: 'patientId',
          pipeline: [
            { $match: { _id: { $type: 'objectId' }, patientId: { $type: 'objectId' }, sessionId: { $type: 'objectId' } } },
            { $match: { $expr: { $and: [
              { $eq: [{ $type: '$patientId' }, 'objectId'] },
              { $eq: [{ $type: '$sessionId' }, 'objectId'] },
            ] } } },
            { $lookup: { from: 'opdSessions', localField: 'sessionId', foreignField: '_id',
              pipeline: [{ $match: { hospitalId, $expr: { $eq: ['$hospitalId', hospitalId] } } },
                { $project: { _id: 1 } }], as: 'session' } },
            { $match: { 'session.0': { $exists: true } } },
            { $limit: 1 }, { $project: { _id: 1 } },
          ], as: 'hospitalBooking' } },
        { $match: { 'hospitalBooking.0': { $exists: true } } },
        { $sort: { fullName: 1, _id: 1 } },
        { $limit: 20 },
        { $project: { fullName: 1, nic: 1 } },
      ], { maxTimeMS: 3000 }).toArray();
      return patients.map(patient => ({ patientId: patient._id.toString(),
        fullName: patient.fullName.trim(), maskedNic: maskNic(patient.nic) }));
    },
  };
}
