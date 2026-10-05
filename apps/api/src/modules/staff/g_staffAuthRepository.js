import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { HttpError } from '../../utils/HttpError.js';
import { writeAuditLog } from '../audit/g_auditLog.js';
import { insertNotification } from '../notifications/g_notificationRepository.js';

const scrypt = promisify(scryptCallback);
const KEY_BYTES = 64;
const passwordHash = async (password, salt) =>
  scrypt(password, salt, KEY_BYTES, { N: 16384, r: 8, p: 1 });

export async function ensureStaffAuthIndexes(db) {
  await db.collection('users').createIndexes([
    {
      key: { staffId: 1 },
      name: 'staff_id_unique',
      unique: true,
      partialFilterExpression: { staffId: { $type: 'string' } },
    },
    {
      key: { staffEmail: 1 },
      name: 'staff_email_unique',
      unique: true,
      partialFilterExpression: { staffEmail: { $type: 'string' } },
    },
  ]);
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createStaffAuthRepository(db, authConfig, { now = () => new Date() } = {}) {
  // Links the account to a hospital record so staff views can be hospital-scoped.
  // A typed name with no matching record is kept as text and left unlinked.
  async function resolveHospital(input) {
    const hospitals = db.collection('hospitals');
    if (input.hospitalId) {
      const hospital = await hospitals.findOne({
        _id: new ObjectId(input.hospitalId),
        isActive: true,
      });
      if (!hospital)
        throw new HttpError(400, 'VALIDATION_ERROR', 'Check the staff account details.', {
          hospitalId: 'Choose a hospital from the list.',
        });
      return hospital;
    }
    return hospitals.findOne({
      name: { $regex: `^${escapeRegex(input.hospital.trim())}$`, $options: 'i' },
      isActive: true,
    });
  }

  return {
    async register(input) {
      if (!authConfig)
        throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Staff account setup is not configured.');
      const staffId = input.staffId.trim().toUpperCase();
      const email = input.email.trim().toLowerCase();
      const mobile = input.mobile.trim();
      // Email and mobile are unique across patients and staff (users_unique_* indexes).
      const existing = await db.collection('users').findOne({
        $or: [{ staffId }, { staffEmail: email }, { email }, { mobile }],
      });
      if (existing?.staffId === staffId || existing?.email === email || existing?.staffEmail === email)
        throw new HttpError(409, 'STAFF_ACCOUNT_EXISTS', 'A staff account with this Staff ID or email already exists.');
      if (existing) throw mobileInUse();

      const hospital = await resolveHospital(input);
      const salt = randomBytes(16).toString('hex');
      const hash = await passwordHash(input.password, salt);
      const createdAt = now();
      const user = {
        _id: new ObjectId(),
        fullName: input.fullName.trim(),
        staffId,
        staffEmail: email,
        email,
        hospital: hospital?.name ?? input.hospital.trim(),
        hospitalId: hospital?._id ?? null,
        role: input.role,
        mobile,
        passwordHash: hash.toString('hex'),
        passwordSalt: salt,
        status: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
      };
      try {
        await db.collection('users').insertOne(user);
      } catch (error) {
        if (error?.code === 11000 && error.keyPattern?.mobile) throw mobileInUse();
        if (error?.code === 11000)
          throw new HttpError(409, 'STAFF_ACCOUNT_EXISTS', 'A staff account with this Staff ID or email already exists.');
        throw error;
      }
      await insertNotification(db, {
        userId: user._id,
        type: 'SYSTEM',
        title: 'Staff account created',
        message: `Welcome, ${user.fullName}. Your ${user.hospital} staff account is ready to use.`,
        data: { event: 'STAFF_ACCOUNT_CREATED' },
        createdAt,
      });
      await writeAuditLog(db, {
        actorUserId: user._id,
        action: 'STAFF_ACCOUNT_CREATED',
        entityType: 'user',
        entityId: user._id,
        metadata: { staffId, role: user.role, hospitalId: user.hospitalId },
        createdAt,
      });
      return publicUser(user);
    },

    async signIn(staffIdInput, password) {
      if (!authConfig)
        throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Staff sign-in is not configured.');
      const staffId = staffIdInput.trim().toUpperCase();
      const user = await db.collection('users').findOne({ staffId }, { maxTimeMS: 3000 });
      if (!user || !['RECEPTION', 'NURSE'].includes(user.role) || user.status !== 'ACTIVE')
        throw invalidCredentials();

      const actual = await passwordHash(password, user.passwordSalt ?? '');
      const expected = Buffer.from(user.passwordHash ?? '', 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        throw invalidCredentials();

      await db.collection('users').updateOne({ _id: user._id }, { $set: { lastLoginAt: now() } });
      const issuedAt = Math.floor(now().getTime() / 1000);
      const accessToken = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(user._id.toString())
        .setIssuer(authConfig.issuer)
        .setAudience(authConfig.audience)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + 60 * 60 * 24)
        .sign(authConfig.key);
      return { accessToken, user: publicUser(user) };
    },
  };
}

function publicUser(user) {
  return {
    userId: user._id.toString(),
    fullName: user.fullName,
    staffId: user.staffId,
    hospital: user.hospital,
    role: user.role,
  };
}

function mobileInUse() {
  const message = 'This mobile number is already used by another account.';
  return new HttpError(409, 'MOBILE_IN_USE', message, { mobile: message });
}

function invalidCredentials() {
  return new HttpError(401, 'INVALID_CREDENTIALS', 'Check your Staff ID and password, then try again.');
}
