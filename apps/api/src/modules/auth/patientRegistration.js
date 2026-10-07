import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from '../../utils/HttpError.js';

const scrypt = promisify(scryptCallback);
const allowed = new Set(['fullName', 'nic', 'mobile', 'email', 'password']);

export function validatePatientRegistration(body) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new HttpError(400, 'VALIDATION_ERROR', 'Enter your account details.');
  for (const key of Object.keys(body))
    if (!allowed.has(key)) errors[key] = 'This field is not supported.';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const nic = typeof body.nic === 'string' ? body.nic.trim().toUpperCase() : '';
  const mobile = typeof body.mobile === 'string' ? body.mobile.replace(/[\s()-]/g, '') : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (fullName.length < 2 || fullName.length > 120 || /[\x00-\x1f\x7f]/.test(fullName))
    errors.fullName = 'Enter a full name between 2 and 120 characters.';
  if (!/^(\d{12}|\d{9}[VX])$/.test(nic)) errors.nic = 'Enter a valid NIC number.';
  if (!/^(?:0|\+94|94)7\d{8}$/.test(mobile)) errors.mobile = 'Enter a valid Sri Lankan mobile number.';
  if (body.email !== undefined && (typeof body.email !== 'string' || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))))
    errors.email = 'Enter a valid email address or leave it blank.';
  if (typeof body.password !== 'string' || body.password.length < 8 || Buffer.byteLength(body.password, 'utf8') > 1024)
    errors.password = 'Use a password of at least 8 characters and at most 1024 bytes.';
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check your account details.', errors);
  return { fullName, nic, mobile: `+94${mobile.slice(-9)}`, ...(email ? { email } : {}), password: body.password };
}

export async function ensurePatientRegistrationIndexes(db) {
  const users = db.collection('users');
  for (const field of ['nic', 'mobile', 'email']) {
    await users.createIndex({ [field]: 1 }, {
      name: `users_unique_${field}`, unique: true,
      partialFilterExpression: { [field]: { $type: 'string' } },
    });
  }
  await users.createIndex({ verificationId: 1 }, {
    name: 'users_unique_verification_id', unique: true,
    partialFilterExpression: { verificationId: { $type: 'string' } },
  });
}

export function createPatientRegistrationRepository(db) {
  const users = db.collection('users');
  return {
    insert: (user) => users.insertOne(user),
    findByNic: (nic) => users.findOne({ nic, role: 'PATIENT' }),
    activatePending: async (id) => {
      await users.updateOne({ _id: id, role: 'PATIENT', status: 'PENDING_VERIFICATION' }, {
        $set: { status: 'ACTIVE', updatedAt: new Date() }, $unset: { verificationId: '' },
      });
      return users.findOne({ _id: id, role: 'PATIENT' });
    },
  };
}

export async function registerPatient(repository, body) {
  const { password, ...details } = validatePatientRegistration(body);
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  const now = new Date();
  try {
    await repository.insert({
      ...details, passwordHash: `scrypt$${salt}$${hash.toString('hex')}`,
      role: 'PATIENT', status: 'ACTIVE',
      createdAt: now, updatedAt: now,
    });
  } catch (error) {
    if (error?.code === 11000)
      throw new HttpError(409, 'ACCOUNT_EXISTS', 'An account with these details already exists.');
    throw error;
  }
  return { registered: true };
}
