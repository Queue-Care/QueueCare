import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';

const roles = new Set(['RECEPTION', 'NURSE']);

export function parseStaffRegistration(body) {
  const errors = Object.create(null);
  const allowed = ['fullName', 'staffId', 'hospital', 'hospitalId', 'role', 'mobile', 'email', 'password'];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.body = 'Send a JSON object containing the staff registration details.';
  } else {
    for (const key of Object.keys(body))
      if (!allowed.includes(key)) errors[key] = 'Unsupported registration field.';
    for (const key of ['fullName', 'staffId', 'hospital', 'mobile', 'email', 'password']) {
      if (typeof body[key] !== 'string' || !body[key].trim()) errors[key] = 'This field is required.';
    }
    if (typeof body.fullName === 'string' && body.fullName.trim().length > 100)
      errors.fullName = 'Must be 100 characters or fewer.';
    if (typeof body.staffId === 'string' && !/^[A-Za-z0-9-]{3,40}$/.test(body.staffId.trim()))
      errors.staffId = 'Use 3 to 40 letters, numbers, or hyphens.';
    if (typeof body.hospital === 'string' && body.hospital.trim().length > 150)
      errors.hospital = 'Must be 150 characters or fewer.';
    if (body.hospitalId !== undefined && (typeof body.hospitalId !== 'string' || !/^[a-f\d]{24}$/i.test(body.hospitalId)))
      errors.hospitalId = 'Choose a hospital from the list.';
    if (typeof body.mobile === 'string' && !/^\+?[0-9 ()-]{7,24}$/.test(body.mobile.trim()))
      errors.mobile = 'Enter a valid mobile number.';
    if (typeof body.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))
      errors.email = 'Enter a valid work email.';
    if (typeof body.password === 'string' && body.password.length < 8)
      errors.password = 'Use at least 8 characters.';
    if (typeof body.password === 'string' && Buffer.byteLength(body.password, 'utf8') > 128)
      errors.password = 'Password must be 128 bytes or fewer.';
    if (body.role !== undefined && !roles.has(body.role))
      errors.role = 'Choose Reception or Nurse.';
  }
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Check the staff account details.', errors);
  return { ...body, role: body.role ?? 'RECEPTION' };
}

export function parseStaffSignIn(body) {
  const errors = Object.create(null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.body = 'Send a JSON object containing Staff ID and password.';
  } else {
    for (const key of Object.keys(body))
      if (!['staffId', 'password'].includes(key)) errors[key] = 'Unsupported sign-in field.';
    if (typeof body.staffId !== 'string' || !body.staffId.trim()) errors.staffId = 'Enter your Staff ID.';
    if (typeof body.password !== 'string' || !body.password) errors.password = 'Enter your password.';
    if (typeof body.password === 'string' && Buffer.byteLength(body.password, 'utf8') > 128)
      errors.password = 'Password must be 128 bytes or fewer.';
  }
  if (Object.keys(errors).length)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Enter your Staff ID and password.', errors);
  return body;
}

export function staffAuthRoutes(repository) {
  const router = Router();
  router.post('/register', async (request, response) => {
    if (!repository)
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Staff registration is unavailable.');
    const user = await repository.register(parseStaffRegistration(request.body));
    response.status(201).json({ success: true, data: { user } });
  });
  router.post('/sign-in', async (request, response) => {
    if (!repository)
      throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'Staff sign-in is unavailable.');
    const { staffId, password } = parseStaffSignIn(request.body);
    const data = await repository.signIn(staffId, password);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });
  return router;
}
