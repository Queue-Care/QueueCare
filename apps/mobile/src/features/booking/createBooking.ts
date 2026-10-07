export type CreatedBooking = {
  id: string;
  bookingCode: string;
  patientId: string;
  sessionId: string;
  status: 'CONFIRMED';
  createdAt: string;
  updatedAt: string;
};
export type BookingErrorKind =
  | 'configuration'
  | 'authentication'
  | 'forbidden'
  | 'full'
  | 'unavailable'
  | 'duplicate'
  | 'validation'
  | 'service'
  | 'uncertain';
export class CreateBookingError extends Error {
  constructor(public readonly kind: BookingErrorKind) {
    super('Unable to confirm appointment');
    this.name = 'CreateBookingError';
  }
}
export const bookingMessages: Record<BookingErrorKind, string> = {
  configuration: 'Booking is not available right now. Please try again later.',
  authentication:
    'Your sign-in has expired or is unavailable. Sign in again to book.',
  forbidden:
    'Your account is not allowed to make this booking. Please check your account status.',
  full: 'This session is now full. Choose another available session.',
  unavailable:
    'This session is no longer available. Refresh and choose another session.',
  duplicate:
    'You already have a booking for this session. Check My bookings before making another appointment.',
  validation:
    'The booking details could not be accepted. Refresh and select your session again.',
  service: 'Booking is temporarily unavailable. Please try again later.',
  uncertain:
    'We couldn’t confirm whether your booking was saved. Check My bookings before trying again. Retrying the same session will not create a duplicate booking.',
};
export function isBookingId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
export function parseCreatedBooking(
  payload: unknown,
  patientId: string,
  sessionId: string,
): CreatedBooking {
  if (!record(payload) || payload.success !== true || !record(payload.data))
    throw new CreateBookingError('uncertain');
  const item = payload.data;
  if (
    !isBookingId(item._id) ||
    !isBookingId(item.patientId) ||
    item.patientId.toLowerCase() !== patientId.toLowerCase() ||
    !isBookingId(item.sessionId) ||
    item.sessionId.toLowerCase() !== sessionId.toLowerCase() ||
    typeof item.bookingCode !== 'string' ||
    // Short codes since 2026-10-07; the long legacy form is still accepted from older API builds.
    !/^OPD-([A-HJ-NP-Z2-9]{6}|[A-F0-9]{32})$/.test(item.bookingCode) ||
    item.status !== 'CONFIRMED' ||
    !timestamp(item.createdAt) ||
    !timestamp(item.updatedAt) ||
    Date.parse(item.updatedAt) < Date.parse(item.createdAt)
  )
    throw new CreateBookingError('uncertain');
  return {
    id: item._id.toLowerCase(),
    bookingCode: item.bookingCode,
    patientId: item.patientId.toLowerCase(),
    sessionId: item.sessionId.toLowerCase(),
    status: 'CONFIRMED',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
function responseError(status: number, payload: unknown): BookingErrorKind {
  if (!record(payload) || payload.success !== false || !record(payload.error))
    return 'uncertain';
  const code = payload.error.code;
  if (status === 401 && code === 'UNAUTHORIZED') return 'authentication';
  if (status === 403 && code === 'FORBIDDEN') return 'forbidden';
  if (status === 409 && code === 'SESSION_FULL') return 'full';
  if (status === 409 && code === 'SESSION_UNAVAILABLE') return 'unavailable';
  if (status === 409 && code === 'BOOKING_ALREADY_EXISTS') return 'duplicate';
  if (status === 404 && code === 'NOT_FOUND') return 'unavailable';
  if (status === 400 && code === 'VALIDATION_ERROR') return 'validation';
  if (
    status === 503 &&
    ['SERVICE_UNAVAILABLE', 'BOOKING_UNAVAILABLE'].includes(String(code))
  )
    return 'service';
  // A server/transport error may follow a committed transaction. Never claim no booking exists.
  return 'uncertain';
}
export async function createBooking({
  patientId,
  sessionId,
  accessToken,
  signal,
}: {
  patientId: string;
  sessionId: string;
  accessToken: string;
  signal: AbortSignal;
}): Promise<CreatedBooking> {
  if (!isBookingId(patientId) || !accessToken.trim() || /\s/.test(accessToken))
    throw new CreateBookingError('authentication');
  if (!isBookingId(sessionId)) throw new CreateBookingError('validation');
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(
    /\/+$/,
    '',
  );
  if (!baseUrl || !/^https?:\/\//.test(baseUrl))
    throw new CreateBookingError('configuration');
  if (signal.aborted) throw new CreateBookingError('uncertain');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel);
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sessionId: sessionId.toLowerCase() }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json();
    if (response.status !== 201)
      throw new CreateBookingError(responseError(response.status, payload));
    return parseCreatedBooking(payload, patientId, sessionId);
  } catch (error) {
    if (error instanceof CreateBookingError) throw error;
    throw new CreateBookingError('uncertain');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
