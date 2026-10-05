import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT } from 'jose';
import { HttpError } from '../../utils/HttpError.js';

const scrypt = promisify(scryptCallback);
const unauthorized = () => new HttpError(401, 'INVALID_CREDENTIALS', 'NIC or password is incorrect.');

export async function loginPatient(repository, config, body) {
  if (!config) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Patient login is not configured.');
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(key => !['nic', 'password'].includes(key)) ||
    typeof body.nic !== 'string' || !/^(\d{12}|\d{9}[VX])$/i.test(body.nic.trim()) ||
    typeof body.password !== 'string' || !body.password || Buffer.byteLength(body.password, 'utf8') > 1024)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Enter a valid NIC and password.');
  let user = await repository.findByNic(body.nic.trim().toUpperCase());
  const stored = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(user?.passwordHash || '');
  const derived = await scrypt(body.password, stored?.[1] || '00000000000000000000000000000000', 64);
  const matches = timingSafeEqual(derived, Buffer.from(stored?.[2] || '0'.repeat(128), 'hex'));
  if (!stored || !matches || user.role !== 'PATIENT') throw unauthorized();
  // Accounts created by the previous registration implementation can sign in
  // after proving their password, under the new flow without mobile verification.
  if (user.status === 'PENDING_VERIFICATION') user = await repository.activatePending(user._id);
  if (!user || user.status !== 'ACTIVE')
    throw new HttpError(403, 'FORBIDDEN', 'This account is not active.');
  const accessToken = await new SignJWT({ role: 'PATIENT' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user._id.toString())
    .setIssuer(config.issuer).setAudience(config.audience)
    .setIssuedAt().setExpirationTime('24h').sign(config.key);
  return { accessToken, userId: user._id.toString(), role: 'PATIENT', patient: { fullName: user.fullName, nic: user.nic } };
}
