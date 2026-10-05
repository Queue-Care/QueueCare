import { HttpError } from '../../utils/HttpError.js';

export const LANGUAGES = ['en', 'si', 'ta'];

const text = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

// Only the last four characters of a NIC ever leave the API.
export function maskNic(nic) {
  const value = text(nic);
  return value && value.length > 4 ? `········${value.slice(-4)}` : null;
}

function toProfile(user) {
  return {
    userId: user._id.toString(),
    role: user.role,
    fullName: text(user.fullName) ?? '',
    staffId: text(user.staffId),
    hospital: text(user.hospital),
    maskedNic: maskNic(user.nic),
    phone: text(user.mobile) ?? text(user.phone),
    email: text(user.email),
    preferredLanguage: LANGUAGES.includes(user.preferredLanguage)
      ? user.preferredLanguage
      : 'en',
    notificationsEnabled: user.notificationsEnabled !== false,
    profileImageUrl: text(user.profileImageUrl),
    updatedAt:
      user.updatedAt instanceof Date ? user.updatedAt.toISOString() : null,
  };
}

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Account not found.');

const mediaUnavailable = () =>
  new HttpError(
    503,
    'MEDIA_NOT_CONFIGURED',
    'Photo upload is not set up on the server yet.'
  );
const mediaFailed = () =>
  new HttpError(
    502,
    'MEDIA_UPLOAD_FAILED',
    'The photo could not be saved. Please try again.'
  );

export function createProfileRepository(
  db,
  { now = () => new Date(), mediaStore } = {}
) {
  const users = db.collection('users');

  async function save(userId, changes) {
    try {
      const user = await users.findOneAndUpdate(
        { _id: userId },
        { $set: { ...changes, updatedAt: now() } },
        { returnDocument: 'after' }
      );
      if (!user) throw notFound();
      return toProfile(user);
    } catch (error) {
      if (error?.code === 11000)
        throw new HttpError(
          409,
          'CONTACT_DETAILS_IN_USE',
          'These contact details are already used by another account.'
        );
      throw error;
    }
  }

  return {
    async get(userId) {
      const user = await users.findOne({ _id: userId }, { maxTimeMS: 3000 });
      if (!user) throw notFound();
      return toProfile(user);
    },

    async update(userId, { fullName, phone, email }) {
      const user = await users.findOne(
        { _id: userId },
        { projection: { staffId: 1 }, maxTimeMS: 3000 }
      );
      if (!user) throw notFound();
      const isStaff = typeof user.staffId === 'string';
      const changes = {};
      if (fullName !== undefined) changes.fullName = fullName;
      // Patient and staff registration both store the number as `mobile`.
      if (phone !== undefined) changes.mobile = phone;
      if (email !== undefined) {
        changes.email = email;
        if (isStaff) changes.staffEmail = email;
      }
      return save(userId, changes);
    },

    updatePreferences: (userId, preferences) => save(userId, preferences),

    // MongoDB keeps only the Cloudinary URL and public ID, never the image itself.
    async setImage(userId, buffer) {
      if (!mediaStore) throw mediaUnavailable();
      if (!(await users.findOne({ _id: userId }, { projection: { _id: 1 } })))
        throw notFound();
      let image;
      try {
        image = await mediaStore.upload(
          buffer,
          `queuecare/profiles/${userId.toString()}`
        );
      } catch {
        throw mediaFailed();
      }
      return save(userId, {
        profileImageUrl: image.url,
        profileImagePublicId: image.publicId,
      });
    },

    async removeImage(userId) {
      const user = await users.findOne(
        { _id: userId },
        { projection: { profileImagePublicId: 1 }, maxTimeMS: 3000 }
      );
      if (!user) throw notFound();
      if (user.profileImagePublicId) {
        if (!mediaStore) throw mediaUnavailable();
        try {
          await mediaStore.remove(user.profileImagePublicId);
        } catch {
          throw mediaFailed();
        }
      }
      const updated = await users.findOneAndUpdate(
        { _id: userId },
        {
          $unset: { profileImageUrl: '', profileImagePublicId: '' },
          $set: { updatedAt: now() },
        },
        { returnDocument: 'after' }
      );
      return toProfile(updated);
    },
  };
}
