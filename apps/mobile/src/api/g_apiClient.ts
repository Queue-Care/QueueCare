// Shared client for the signed-in staff, notification and profile endpoints.
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly code = '',
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export type ApiResult = { data: unknown; meta: Record<string, unknown> };

const apiBase = () =>
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');

// Photos kept by our own API come back as a path such as /media/...; this turns
// it into a full address for <Image>. Full addresses (Cloudinary) are unchanged.
export function resolveImageUrl(value: unknown) {
  if (!isText(value)) return null;
  if (!value.startsWith('/')) return value;
  const base = apiBase();
  return base ? `${base}${value}` : null;
}

export async function apiRequest(
  path: string,
  options: {
    token?: string;
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    // Multipart upload; sent instead of a JSON body.
    formData?: FormData;
    signal?: AbortSignal;
  } = {},
): Promise<ApiResult> {
  // Not a server rejection, so callers show the message instead of signing out.
  if (!options.token?.trim())
    throw new ApiError('Please sign in again to continue.');
  const base = apiBase();
  if (!base || !/^https?:\/\//.test(base))
    throw new ApiError(
      'This service is unavailable until the API address is configured.',
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort);
  // Uploads over hospital Wi-Fi get longer than ordinary requests.
  const timeout = setTimeout(abort, options.formData ? 60000 : 15000);
  try {
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${options.token}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        // No Content-Type here: fetch adds the multipart boundary itself.
        ...(options.formData ? { body: options.formData } : {}),
      });
    } catch {
      throw new ApiError(
        'Could not connect. Check your connection and try again.',
        0, 'NETWORK_ERROR',
      );
    }
    try { payload = await response.json(); }
    catch {
      if (controller.signal.aborted)
        throw new ApiError('Could not connect. Check your connection and try again.', 0, 'NETWORK_ERROR');
      throw unreadableResponse();
    }
    if (!response.ok || !isRecord(payload) || payload.success !== true) {
      const error =
        isRecord(payload) && isRecord(payload.error) ? payload.error : {};
      throw new ApiError(
        isText(error.message)
          ? error.message
          : 'We could not complete this action. Please try again.',
        response.status,
        isText(error.code) ? error.code : '',
        isRecord(error.fieldErrors)
          ? (error.fieldErrors as Record<string, string>)
          : {},
      );
    }
    return {
      data: payload.data,
      meta: isRecord(payload.meta) ? payload.meta : {},
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.';
}

export const unreadableResponse = () =>
  new ApiError('We could not read the server response. Please try again.');
