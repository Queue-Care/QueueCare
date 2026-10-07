import { v2 as cloudinary } from 'cloudinary';

// Cloudinary is the only media store (README 9). Credentials stay on the server.
// Returns undefined when they are not configured, so the API can answer 503.
export function createMediaStore(env = process.env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) return undefined;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  return {
    // Re-uploading to the same public ID replaces the previous photo.
    upload(buffer, publicId) {
      return new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              public_id: publicId,
              overwrite: true,
              invalidate: true,
              resource_type: 'image',
              transformation: [
                { width: 512, height: 512, crop: 'fill', gravity: 'face' },
              ],
            },
            (error, result) =>
              error
                ? reject(error)
                : resolve({ url: result.secure_url, publicId: result.public_id })
          )
          .end(buffer);
      });
    },
    async remove(publicId) {
      await cloudinary.uploader.destroy(publicId, { invalidate: true });
    },
  };
}
