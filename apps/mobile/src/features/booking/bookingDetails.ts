import { isBookingId } from './createBooking';
import {
  isCalendarDate,
  matchesSessionInstant,
  SESSION_TIME_ZONE,
} from './availableSessions';
export const bookingStatuses = [
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'SKIPPED',
  'RESCHEDULED',
] as const;
export const sessionStatuses = [
  'OPEN',
  'CLOSED',
  'RUNNING',
  'COMPLETED',
  'CANCELLED',
] as const;
export type BookingDetails = {
  id: string;
  bookingCode: string;
  patientId: string;
  sessionId: string;
  status: (typeof bookingStatuses)[number];
  createdAt: string;
  updatedAt: string;
  assignedTime?: string;
  queueType?: 'NORMAL' | 'PRIORITY';
  hospital: {
    id: string;
    name: string;
    address: string;
    city: string;
    isActive: boolean;
  };
  service: { id: string; name: string; isActive: boolean };
  session: {
    id: string;
    hospitalId: string;
    serviceId: string;
    doctorOrTeam: string;
    status: (typeof sessionStatuses)[number];
    sessionDate: string;
    startTime: string;
    endTime: string;
    startsAt: string;
    endsAt: string;
  };
};
export class BookingDetailsError extends Error {
  constructor(
    public readonly kind:
      | 'authentication'
      | 'forbidden'
      | 'unavailable'
      | 'incomplete'
      | 'configuration'
      | 'network'
      | 'response',
  ) {
    super('Unable to load booking details');
    this.name = 'BookingDetailsError';
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function date(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
export function parseBookingDetails(
  payload: unknown,
  bookingId: string,
  patientId: string,
): BookingDetails {
  const invalid = () => new BookingDetailsError('response');
  if (!record(payload) || payload.success !== true || !record(payload.data))
    throw invalid();
  const b = payload.data,
    h = b.hospital,
    s = b.service,
    slot = b.session;
  if (
    !isBookingId(b._id) ||
    b._id.toLowerCase() !== bookingId.toLowerCase() ||
    !isBookingId(b.patientId) ||
    b.patientId.toLowerCase() !== patientId.toLowerCase() ||
    !isBookingId(b.sessionId) ||
    !text(b.bookingCode) ||
    !bookingStatuses.includes(b.status as BookingDetails['status']) ||
    !date(b.createdAt) ||
    !date(b.updatedAt) ||
    Date.parse(b.updatedAt) < Date.parse(b.createdAt) ||
    !record(h) ||
    !isBookingId(h._id) ||
    !text(h.name) ||
    !text(h.address) ||
    !text(h.city) ||
    typeof h.isActive !== 'boolean' ||
    !record(s) ||
    !isBookingId(s._id) ||
    !text(s.name) ||
    typeof s.isActive !== 'boolean' ||
    !record(slot) ||
    !isBookingId(slot._id) ||
    slot._id.toLowerCase() !== b.sessionId.toLowerCase() ||
    !isBookingId(slot.hospitalId) ||
    slot.hospitalId.toLowerCase() !== h._id.toLowerCase() ||
    !isBookingId(slot.serviceId) ||
    slot.serviceId.toLowerCase() !== s._id.toLowerCase() ||
    !text(slot.doctorOrTeam) ||
    !sessionStatuses.includes(
      slot.status as BookingDetails['session']['status'],
    ) ||
    typeof slot.sessionDate !== 'string' ||
    !isCalendarDate(slot.sessionDate) ||
    !matchesSessionInstant(slot.startsAt, slot.sessionDate, slot.startTime) ||
    !matchesSessionInstant(slot.endsAt, slot.sessionDate, slot.endTime) ||
    Date.parse(slot.endsAt) <= Date.parse(slot.startsAt)
  )
    throw invalid();
  if (b.assignedTime !== undefined && (!date(b.assignedTime) || !['NORMAL', 'PRIORITY'].includes(String(b.queueType)))) throw invalid();
  return {
    id: b._id.toLowerCase(),
    bookingCode: b.bookingCode,
    patientId: b.patientId.toLowerCase(),
    sessionId: b.sessionId.toLowerCase(),
    status: b.status as BookingDetails['status'],
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    ...(b.assignedTime !== undefined ? { assignedTime: b.assignedTime as string, queueType: b.queueType as 'NORMAL' | 'PRIORITY' } : {}),
    hospital: {
      id: h._id.toLowerCase(),
      name: h.name,
      address: h.address,
      city: h.city,
      isActive: h.isActive,
    },
    service: { id: s._id.toLowerCase(), name: s.name, isActive: s.isActive },
    session: {
      id: slot._id.toLowerCase(),
      hospitalId: slot.hospitalId.toLowerCase(),
      serviceId: slot.serviceId.toLowerCase(),
      doctorOrTeam: slot.doctorOrTeam,
      status: slot.status as BookingDetails['session']['status'],
      sessionDate: slot.sessionDate,
      startTime: slot.startTime as string,
      endTime: slot.endTime as string,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    },
  };
}
export function bookingDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SESSION_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}
export async function getBookingDetails(
  bookingId: string,
  patientId: string | undefined,
  accessToken: string | undefined,
  signal: AbortSignal,
) {
  if (!isBookingId(patientId) || !accessToken?.trim() || /\s/.test(accessToken))
    throw new BookingDetailsError('authentication');
  if (!isBookingId(bookingId)) throw new BookingDetailsError('unavailable');
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(
    /\/+$/,
    '',
  );
  if (!baseUrl || !/^https?:\/\//.test(baseUrl))
    throw new BookingDetailsError('configuration');
  if (signal.aborted) throw new BookingDetailsError('network');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel);
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(
      `${baseUrl}/bookings/${bookingId.toLowerCase()}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      },
    );
    if (response.status === 401)
      throw new BookingDetailsError('authentication');
    if (response.status === 403) throw new BookingDetailsError('forbidden');
    if (response.status === 404) throw new BookingDetailsError('unavailable');
    if (response.status === 409) throw new BookingDetailsError('incomplete');
    if (response.status !== 200) throw new BookingDetailsError('network');
    return parseBookingDetails(await response.json(), bookingId, patientId);
  } catch (error) {
    if (error instanceof BookingDetailsError) throw error;
    throw new BookingDetailsError('network');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
