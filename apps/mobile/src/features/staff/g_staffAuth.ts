export type StaffRole = 'RECEPTION' | 'NURSE';
export type StaffAccount = {
  userId: string;
  fullName: string;
  staffId: string;
  hospital: string;
  role: StaffRole;
  preferredLanguage?: 'en' | 'si' | 'ta';
};
export type StaffSession = StaffAccount & { accessToken: string };

export class StaffAuthError extends Error {
  constructor(message: string, public readonly status = 0, public readonly code = '') { super(message); }
  // Per-field messages from the API's VALIDATION_ERROR response, when present.
  fieldErrors: Record<string, string> = {};
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function apiBase() {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base || !/^https?:\/\//.test(base))
    throw new StaffAuthError(
      'Staff accounts are unavailable until the API address is configured.',
    );
  return base;
}

async function request(path: string, body: unknown, signal?: AbortSignal) {
  const url = `${apiBase()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw new StaffAuthError(
      'Could not connect. Check your connection and try again.',
      0, 'NETWORK_ERROR',
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new StaffAuthError(
      'We could not read the server response. Please try again.',
    );
  }
  if (!object(payload) || payload.success !== true || !object(payload.data)) {
    const error =
      object(payload) && object(payload.error) ? payload.error : null;
    const message =
      error && typeof error.message === 'string'
        ? error.message
        : 'We could not complete this action. Please try again.';
    const failure = new StaffAuthError(message, response.status,
      error && typeof error.code === 'string' ? error.code : '');
    if (error && object(error.fieldErrors))
      failure.fieldErrors = error.fieldErrors as Record<string, string>;
    throw failure;
  }
  if (!response.ok)
    throw new StaffAuthError(
      'We could not complete this action. Please try again.',
    );
  return payload.data;
}

function parseAccount(value: unknown): StaffAccount {
  if (
    !object(value) ||
    !['userId', 'fullName', 'staffId', 'hospital'].every(
      key => typeof value[key] === 'string' && value[key],
    ) ||
    !['RECEPTION', 'NURSE'].includes(String(value.role))
  )
    throw new StaffAuthError(
      'We could not read the staff account. Please try again.',
    );
  return value as unknown as StaffAccount;
}

export async function registerStaff(input: {
  fullName: string;
  staffId: string;
  hospital: string;
  hospitalId?: string;
  role: StaffRole;
  mobile: string;
  email: string;
  password: string;
}) {
  const data = await request('/staff/auth/register', input);
  return parseAccount(data.user);
}

export async function signInStaff(
  staffId: string,
  password: string,
  signal?: AbortSignal,
): Promise<StaffSession> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  let rejectAborted!: (reason: StaffAuthError) => void;
  const cancelled = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
  const onAbort = () => rejectAborted(new StaffAuthError(timedOut
    ? 'Sign-in took too long. Check your connection and try again.'
    : 'Sign-in was cancelled. Please try again.', 0, timedOut ? 'TIMEOUT' : 'CANCELLED'));
  controller.signal.addEventListener('abort', onAbort);
  signal?.addEventListener('abort', abort);
  const timeout = setTimeout(() => { timedOut = true; abort(); }, 15000);
  try {
    if (signal?.aborted) abort();
    const data = await Promise.race([
      cancelled,
      controller.signal.aborted ? cancelled
        : request('/staff/auth/sign-in', { staffId, password }, controller.signal),
    ]);
    if (typeof data.accessToken !== 'string' || !data.accessToken)
      throw new StaffAuthError(
        'We could not start your staff session. Please try again.',
      );
    return { ...parseAccount(data.user), accessToken: data.accessToken };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
