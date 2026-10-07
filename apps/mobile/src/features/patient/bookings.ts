import { parseBooking, patientApi, PatientApiError } from './api';

export async function getPatientBookings(
  token: string | undefined,
  status: 'upcoming' | 'past',
  page: number,
  signal: AbortSignal,
) {
  const payload = await patientApi(
    `/bookings/me?status=${status}&page=${page}&limit=20`,
    {
      token,
      signal,
      includeMeta: true,
    },
  );
  const invalid = () =>
    new PatientApiError('We could not read your bookings. Please try again.');
  if (!payload || typeof payload !== 'object') throw invalid();
  const { data, meta } = payload as { data?: unknown; meta?: unknown };
  if (
    !Array.isArray(data) ||
    data.length > 20 ||
    !meta ||
    typeof meta !== 'object'
  )
    throw invalid();
  const m = meta as Record<string, unknown>;
  if (
    m.page !== page ||
    m.limit !== 20 ||
    typeof m.total !== 'number' ||
    !Number.isSafeInteger(m.total) ||
    m.total < 0 ||
    m.totalPages !== Math.ceil(m.total / 20) ||
    m.hasNextPage !== page * 20 < m.total ||
    data.length !== Math.min(20, Math.max(0, m.total - (page - 1) * 20))
  )
    throw invalid();
  const bookings = data.map(parseBooking);
  if (
    new Set(bookings.map(b => b._id)).size !== bookings.length ||
    (status === 'upcoming' && bookings.some(b => b.status !== 'CONFIRMED'))
  )
    throw invalid();
  return { bookings, total: m.total, hasNextPage: m.hasNextPage as boolean };
}
