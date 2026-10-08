import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { HttpError } from '../../utils/HttpError.js';

// apps/api/profile_photo: every uploaded profile photo is an ordinary file here.
export const PROFILE_PHOTO_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../profile_photo'
);

const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
// <user ID>-<random token>.<type>; anything else is never read from disk.
const FILE_NAME = /^[a-f\d]{24}-[a-f\d]{32}\.(jpg|png|webp)$/;

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

// Keeps profile photos as files in the profile_photo folder; MongoDB stores only
// the link to the file. Used when Cloudinary is not configured. It has the same
// upload/remove shape as the Cloudinary store, so the profile code does not care
// which one is active.
export function createFileMediaStore(directory = PROFILE_PHOTO_DIRECTORY) {
  // Public IDs end with the owner's user ID, which starts each of their files.
  const ownerOf = (publicId) => publicId.split('/').pop();
  async function removeOwned(owner, except) {
    const names = await readdir(directory).catch(() => []);
    await Promise.all(
      names
        .filter((name) => name.startsWith(`${owner}-`) && name !== except)
        .map((name) => unlink(join(directory, name)).catch(() => {}))
    );
  }
  return {
    // One photo per owner: a new upload replaces the previous file.
    async upload(buffer, publicId) {
      const owner = ownerOf(publicId);
      const type = imageContentType(buffer) ?? 'image/jpeg';
      // A fresh random token per upload gives the photo an unguessable address
      // and makes the phone load the new photo instead of a cached old one.
      const name = `${owner}-${randomBytes(16).toString('hex')}.${
        extensions[type]
      }`;
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, name), buffer);
      await removeOwned(owner, name);
      // Relative to the API base URL, so it keeps working when the laptop's IP changes.
      return { url: `/media/profile-photos/${name}`, publicId };
    },

    remove: (publicId) => removeOwned(ownerOf(publicId)),

    async read(name) {
      if (!FILE_NAME.test(name)) return null;
      const data = await readFile(join(directory, name)).catch(() => null);
      const contentType = Object.keys(extensions).find(
        (type) => extensions[type] === name.split('.').pop()
      );
      return data && { data, contentType };
    },
  };
}

// Serves a stored photo. No sign-in is needed because <Image> cannot send a
// token; the random address is what protects the photo.
export function mediaRoutes(store) {
  const router = Router();
  router.get('/profile-photos/:name', async (request, response) => {
    const image = await store?.read(request.params.name);
    if (!image) throw new HttpError(404, 'NOT_FOUND', 'Photo not found.');
    response
      .set({
        'Content-Type': image.contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image.data);
  });
  return router;
}
