export type StaffRole = 'RECEPTION' | 'NURSE';
export type StaffAccount = {
  userId: string;
  fullName: string;
  staffId: string;
  hospital: string;
  role: StaffRole;
};
export type StaffSession = StaffAccount & { accessToken: string };

export class StaffAuthError extends Error {
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

async function request(path: string, body: unknown) {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new StaffAuthError(
      'Could not connect. Check your connection and try again.',
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
    const failure = new StaffAuthError(message);
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
): Promise<StaffSession> {
  const data = await request('/staff/auth/sign-in', { staffId, password });
  if (typeof data.accessToken !== 'string' || !data.accessToken)
    throw new StaffAuthError(
      'We could not start your staff session. Please try again.',
    );
  return { ...parseAccount(data.user), accessToken: data.accessToken };
}
