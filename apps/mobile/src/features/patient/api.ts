export type Booking = {
  _id: string;
  bookingCode: string;
  hospitalName: string;
  serviceName: string;
  startsAt: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'SKIPPED' | 'RESCHEDULED';
  patientName?: string;
  maskedNic?: string;
  priorityRequestId?: string;
  assignedTime?: string;
  queueType?: 'NORMAL' | 'PRIORITY';
};
export type PriorityRequest = {
  _id: string;
  bookingId: string;
  reason: 'ELDERLY' | 'MOBILITY' | 'PREGNANT' | 'OTHER';
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  note?: string;
  decisionNote?: string;
  decisionCode?: string;
};
export const reasons = {
  ELDERLY: 'Elderly patient',
  MOBILITY: 'Mobility assistance',
  PREGNANT: 'Pregnant patient',
  OTHER: 'Something else',
} as const;
export class PatientApiError extends Error {}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const zonedDate = (value: unknown): value is string =>
  nonempty(value) &&
  /(Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

export function parseBooking(value: unknown): Booking {
  // Develop's details endpoint returns linked records; lists use flat summaries.
  if (
    object(value) &&
    object(value.hospital) &&
    object(value.service) &&
    object(value.session)
  ) {
    value = {
      ...value,
      hospitalName: value.hospital.name,
      serviceName: value.service.name,
      startsAt: value.session.startsAt,
    };
  }
  if (
    !object(value) ||
    !['_id', 'bookingCode', 'hospitalName', 'serviceName'].every(key =>
      nonempty(value[key]),
    ) ||
    !zonedDate(value.startsAt) ||
    !['CONFIRMED', 'CANCELLED', 'COMPLETED', 'SKIPPED', 'RESCHEDULED'].includes(
      String(value.status),
    )
  )
    throw new PatientApiError(
      'We could not read this booking. Please try again.',
    );
  for (const key of ['patientName', 'maskedNic', 'priorityRequestId'])
    if (value[key] !== undefined && !nonempty(value[key]))
      throw new PatientApiError(
        'We could not read this booking. Please try again.',
      );
  if (value.assignedTime !== undefined && (!zonedDate(value.assignedTime) || !['NORMAL', 'PRIORITY'].includes(String(value.queueType))))
    throw new PatientApiError('We could not read this appointment time.');
  return value as Booking;
}
export function parsePriority(value: unknown): PriorityRequest {
  if (
    !object(value) ||
    !nonempty(value._id) ||
    !nonempty(value.bookingId) ||
    !Object.keys(reasons).includes(String(value.reason)) ||
    !['PENDING', 'ACCEPTED', 'DECLINED'].includes(String(value.status)) ||
    !zonedDate(value.createdAt)
  )
    throw new PatientApiError(
      'We could not read your request. Please try again.',
    );
  for (const key of ['note', 'decisionNote'])
    if (value[key] !== undefined && typeof value[key] !== 'string')
      throw new PatientApiError(
        'We could not read your request. Please try again.',
      );
  return value as PriorityRequest;
}
export async function patientApi(
  path: string,
  options: {
    token?: string;
    public?: boolean;
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    includeMeta?: boolean;
  } = {},
): Promise<unknown> {
  if (!options.public && !options.token?.trim())
    throw new PatientApiError('Please sign in again to view your account.');
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base || !/^https?:\/\//.test(base))
    throw new PatientApiError(
      'This service is not available yet. Please try again later.',
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort);
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    if (response.status === 401 && path === '/auth/patient/login')
      throw new PatientApiError('NIC or password is incorrect.');
    if (response.status === 403 && path === '/auth/patient/login')
      throw new PatientApiError('This account is not active.');
    if (response.status === 409 && path === '/auth/patient/register')
      throw new PatientApiError(
        'An account with these details already exists. Please sign in.',
      );
    if (response.status === 401 || response.status === 403)
      throw new PatientApiError('Please sign in again to continue.');
    if (response.status === 409 && path.endsWith('/priority-requests'))
      throw new PatientApiError('This booking may already have a pending or accepted priority request, or the session is no longer available. Check Request status before submitting again.');
    if (response.status === 409)
      throw new PatientApiError(
        'This action is no longer available. Refresh your booking and try again.',
      );
    if (!response.ok)
      throw new PatientApiError(
        'We could not complete this action. Please try again.',
      );
    const payload: unknown = await response.json();
    if (!object(payload) || payload.success !== true || !('data' in payload))
      throw new PatientApiError(
        'We could not read the response. Please try again.',
      );
    return options.includeMeta ? payload : payload.data;
  } catch (error) {
    if (error instanceof PatientApiError) throw error;
    throw new PatientApiError(
      'Could not connect. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
export function message(error: unknown) {
  return error instanceof PatientApiError
    ? error.message
    : 'Something went wrong. Please try again.';
}
export function formatVisit(startsAt: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(startsAt));
}
