import { apiRequest, isRecord, unreadableResponse } from '../../api/g_apiClient';
import { isCalendarDate } from '../booking/availableSessions';

export type SessionView = 'today' | 'upcoming';
export type StaffOpdSession = {
  _id: string;
  hospitalId: string;
  serviceId: string | null;
  serviceName: string | null;
  doctorOrTeam: string | null;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  bookedCount: number | null;
  status: 'OPEN' | 'CLOSED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | null;
};
export type StaffSessionPage = { data: StaffOpdSession[]; hasMore: boolean };

function parseSession(value: unknown): StaffOpdSession {
  if (!isRecord(value) ||
      !['_id', 'hospitalId'].every(key => typeof value[key] === 'string' && /^[a-f\d]{24}$/i.test(value[key] as string)) ||
      typeof value.sessionDate !== 'string' || !isCalendarDate(value.sessionDate) ||
      !['serviceId', 'serviceName', 'doctorOrTeam', 'startTime', 'endTime'].every(key =>
        value[key] === null || typeof value[key] === 'string') ||
      !['capacity', 'bookedCount'].every(key => value[key] === null ||
        (Number.isSafeInteger(value[key]) && (value[key] as number) >= 0)) ||
      (value.status !== null && !['OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'].includes(String(value.status))))
    throw unreadableResponse();
  return value as StaffOpdSession;
}

export async function fetchStaffSessions(token: string | undefined, view: SessionView,
  page = 1, signal?: AbortSignal): Promise<StaffSessionPage> {
  const result = await apiRequest(`/staff/sessions?view=${view}&page=${page}&limit=50`, { token, signal });
  if (!Array.isArray(result.data) || typeof result.meta.hasMore !== 'boolean') throw unreadableResponse();
  return { data: result.data.map(parseSession), hasMore: result.meta.hasMore };
}

export async function fetchStaffSession(token: string | undefined, id: string, signal?: AbortSignal) {
  const result = await apiRequest(`/staff/sessions/${encodeURIComponent(id)}`, { token, signal });
  return parseSession(result.data);
}

export async function closeStaffSessionBookings(token: string | undefined, id: string, signal?: AbortSignal) {
  const result = await apiRequest(`/staff/sessions/${encodeURIComponent(id)}/close-bookings`,
    { token, method: 'PATCH', body: {}, signal });
  const session = parseSession(result.data);
  if (session._id !== id || session.status !== 'CLOSED') throw unreadableResponse();
  return session;
}

export function sessionDayLabel(date: string) {
  // The API date is a calendar day, not a device-local timestamp.
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
}
