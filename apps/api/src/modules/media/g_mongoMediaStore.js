import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { Binary } from 'mongodb';
import { HttpError } from '../../utils/HttpError.js';

// The file's own leading bytes decide its type; the client's label is not trusted.
export function imageContentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'image/jpeg';
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export async function ensureProfileImageIndexes(db) {
  await db
    .collection('profileImages')
    .createIndex({ token: 1 }, { name: 'profile_image_token', unique: true });
}

// Keeps profile photos in the MongoDB `profileImages` collection. Used when
// Cloudinary is not configured. It has the same upload/remove shape as the
// Cloudinary store, so the profile code does not care which one is active.
export function createMongoMediaStore(db, { now = () => new Date() } = {}) {
  const images = db.collection('profileImages');
  return {
    // One photo per owner: a new upload replaces the previous one.
    async upload(buffer, publicId) {
      // A fresh random token per upload gives the photo an unguessable address
      // and makes the phone load the new photo instead of a cached old one.
      const token = randomBytes(16).toString('hex');
      await images.updateOne(
        { _id: publicId },
        {
          $set: {
            token,
            data: new Binary(buffer),
            contentType: imageContentType(buffer) ?? 'image/jpeg',
            size: buffer.length,
            updatedAt: now(),
          },
        },
        { upsert: true }
      );
      // Relative to the API base URL, so it keeps working when the laptop's IP changes.
      return { url: `/media/profile-images/${token}`, publicId };
    },

    async remove(publicId) {
      await images.deleteOne({ _id: publicId });
    },

    read: (token) => images.findOne({ token }, { maxTimeMS: 3000 }),
  };
}

// Serves a stored photo. No sign-in is needed because <Image> cannot send a
// token; the random address is what protects the photo.
export function mediaRoutes(store) {
  const router = Router();
  router.get('/profile-images/:token', async (request, response) => {
    const image = /^[a-f\d]{32}$/.test(request.params.token)
      ? await store?.read(request.params.token)
      : null;
    if (!image) throw new HttpError(404, 'NOT_FOUND', 'Photo not found.');
    response
      .set({
        'Content-Type': image.contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image.data.buffer);
  });
  return router;
}
