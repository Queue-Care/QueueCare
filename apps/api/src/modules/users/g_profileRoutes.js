import { Router } from 'express';
import multer from 'multer';
import { HttpError } from '../../utils/HttpError.js';
import { imageContentType } from '../media/g_mongoMediaStore.js';
import { LANGUAGES } from './g_profileRepository.js';

function fields(body, allowed, errors) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.body = 'Send a JSON object containing the fields to change.';
    return false;
  }
  for (const key of Object.keys(body))
    if (!allowed.includes(key)) errors[key] = 'This field cannot be changed.';
  if (!allowed.some((key) => body[key] !== undefined))
    errors.body = 'Send at least one field to change.';
  return true;
}

export function parseProfileUpdate(body) {
  const errors = Object.create(null);
  const changes = {};
  if (fields(body, ['fullName', 'phone', 'email'], errors)) {
    if (body.fullName !== undefined) {
      if (typeof body.fullName !== 'string' || !body.fullName.trim())
        errors.fullName = 'Enter your full name.';
      else if (body.fullName.trim().length > 100)
        errors.fullName = 'Must be 100 characters or fewer.';
      else changes.fullName = body.fullName.trim();
    }
    if (body.phone !== undefined) {
      if (
        typeof body.phone !== 'string' ||
        !/^\+?[0-9 ()-]{7,24}$/.test(body.phone.trim())
      )
        errors.phone = 'Enter a valid mobile number.';
      else changes.phone = body.phone.trim();
    }
    if (body.email !== undefined) {
      if (
        typeof body.email !== 'string' ||
        body.email.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
      )
        errors.email = 'Enter a valid email address.';
      else changes.email = body.email.trim().toLowerCase();
    }
  }
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check your profile details.',
      errors
    );
  return changes;
}

export function parsePreferences(body) {
  const errors = Object.create(null);
  const changes = {};
  if (fields(body, ['preferredLanguage', 'notificationsEnabled'], errors)) {
    if (body.preferredLanguage !== undefined) {
      if (!LANGUAGES.includes(body.preferredLanguage))
        errors.preferredLanguage = 'Choose English, Sinhala, or Tamil.';
      else changes.preferredLanguage = body.preferredLanguage;
    }
    if (body.notificationsEnabled !== undefined) {
      if (typeof body.notificationsEnabled !== 'boolean')
        errors.notificationsEnabled = 'Must be true or false.';
      else changes.notificationsEnabled = body.notificationsEnabled;
    }
  }
  if (Object.keys(errors).length)
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check your preferences.',
      errors
    );
  return changes;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
}).single('image');

const invalidImage = (message, status = 400) =>
  new HttpError(status, 'VALIDATION_ERROR', message, { image: message });

// Reads the multipart "image" field into memory for the Cloudinary upload.
function receiveImage(request, response, next) {
  receive(request, response, (error) => {
    if (!error) return next();
    next(
      error.code === 'LIMIT_FILE_SIZE'
        ? invalidImage('The photo must be 5 MB or smaller.', 413)
        : invalidImage('Send one photo in the "image" field.')
    );
  });
}

// The profile always belongs to the token's user; no user ID is accepted.
export function profileRoutes(repository, authenticate) {
  const router = Router();
  router.use(authenticate);
  router.use((_request, _response, next) => {
    if (!repository)
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Profile details are unavailable.'
      );
    next();
  });

  router.get('/', async (request, response) => {
    const data = await repository.get(request.auth.userId);
    response.set('Cache-Control', 'no-store').json({ success: true, data });
  });

  router.patch('/', async (request, response) => {
    const data = await repository.update(
      request.auth.userId,
      parseProfileUpdate(request.body)
    );
    response.json({ success: true, data });
  });

  router.patch('/preferences', async (request, response) => {
    const data = await repository.updatePreferences(
      request.auth.userId,
      parsePreferences(request.body)
    );
    response.json({ success: true, data });
  });

  router.post('/profile-image', receiveImage, async (request, response) => {
    if (!request.file) throw invalidImage('Choose a photo to upload.');
    if (!imageContentType(request.file.buffer))
      throw invalidImage('Use a JPEG, PNG, or WebP photo.');
    const data = await repository.setImage(
      request.auth.userId,
      request.file.buffer
    );
    response.status(201).json({ success: true, data });
  });

  router.delete('/profile-image', async (request, response) => {
    const data = await repository.removeImage(request.auth.userId);
    response.json({ success: true, data });
  });

  return router;
}
