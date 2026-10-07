import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  apiRequest,
  isRecord,
  isText,
  resolveImageUrl,
  unreadableResponse,
} from '../../api/g_apiClient';

export type Language = 'en' | 'si' | 'ta';
export type Profile = {
  userId: string;
  role: string;
  fullName: string;
  staffId: string | null;
  hospital: string | null;
  maskedNic: string | null;
  phone: string | null;
  email: string | null;
  preferredLanguage: Language;
  notificationsEnabled: boolean;
  profileImageUrl: string | null;
};
// The fields of an expo-image-picker asset that the upload needs.
export type PickedImage = {
  uri: string;
  width?: number;
  mimeType?: string | null;
  fileName?: string | null;
};
const MAX_UPLOAD_WIDTH = 1000;

export const languageLabels: Record<Language, string> = {
  en: 'English',
  si: 'සිංහල',
  ta: 'தமிழ்',
};

const optionalText = (value: unknown) => (isText(value) ? value : null);

export function parseProfile(value: unknown): Profile {
  if (
    !isRecord(value) ||
    !isText(value.userId) ||
    !isText(value.role) ||
    typeof value.fullName !== 'string'
  )
    throw unreadableResponse();
  return {
    userId: value.userId,
    role: value.role,
    fullName: value.fullName,
    staffId: optionalText(value.staffId),
    hospital: optionalText(value.hospital),
    maskedNic: optionalText(value.maskedNic),
    phone: optionalText(value.phone),
    email: optionalText(value.email),
    preferredLanguage:
      String(value.preferredLanguage) in languageLabels
        ? (value.preferredLanguage as Language)
        : 'en',
    notificationsEnabled: value.notificationsEnabled !== false,
    profileImageUrl: resolveImageUrl(value.profileImageUrl),
  };
}

export async function fetchProfile(
  token: string | undefined,
  signal?: AbortSignal,
) {
  return parseProfile((await apiRequest('/me', { token, signal })).data);
}

export async function updateProfile(
  token: string | undefined,
  changes: { fullName?: string; phone?: string; email?: string },
) {
  const { data } = await apiRequest('/me', {
    token,
    method: 'PATCH',
    body: changes,
  });
  return parseProfile(data);
}

export async function updatePreferences(
  token: string | undefined,
  changes: { preferredLanguage?: Language; notificationsEnabled?: boolean },
) {
  const { data } = await apiRequest('/me/preferences', {
    token,
    method: 'PATCH',
    body: changes,
  });
  return parseProfile(data);
}

// Shrinks the chosen photo to a small JPEG on the phone, so camera photos stay
// under the upload limit and every phone sends a format the API accepts.
// The square crop is done by Cloudinary, centred on the face.
export async function prepareProfileImage(
  image: PickedImage,
): Promise<PickedImage> {
  try {
    const context = ImageManipulator.manipulate(image.uri);
    if (image.width === undefined || image.width > MAX_UPLOAD_WIDTH)
      context.resize({ width: MAX_UPLOAD_WIDTH });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.8,
    });
    return { uri: saved.uri, mimeType: 'image/jpeg', fileName: 'profile.jpg' };
  } catch {
    // If the phone cannot process the photo, the original is still tried.
    return image;
  }
}

// The photo goes to the Express API, which stores it (MongoDB, or Cloudinary
// when its keys are set) and saves its address on the user's account.
export async function uploadProfileImage(
  token: string | undefined,
  image: PickedImage,
) {
  const formData = new FormData();
  // React Native's FormData takes a { uri, name, type } file description.
  formData.append('image', {
    uri: image.uri,
    name: image.fileName ?? 'profile.jpg',
    type: image.mimeType ?? 'image/jpeg',
  } as unknown as Blob);
  const { data } = await apiRequest('/me/profile-image', {
    token,
    method: 'POST',
    formData,
  });
  return parseProfile(data);
}

export async function deleteProfileImage(token: string | undefined) {
  const { data } = await apiRequest('/me/profile-image', {
    token,
    method: 'DELETE',
  });
  return parseProfile(data);
}
