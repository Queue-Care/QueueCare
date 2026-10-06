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
export type StaffSessionPage = { data: StaffOpdSession[]; hasMore: boolean; hospitalId: string };

export type StaffSessionMetrics = {
  sessionId: string; status: NonNullable<StaffOpdSession['status']>; capacity: number;
  bookedCount: number; waitingCount: number; servingCount: number; priorityCount: number;
  patientsCheckedIn: number; nowServing: string | null;
};

export async function fetchStaffSessionMetrics(token: string | undefined, sessionId: string,
  signal?: AbortSignal): Promise<StaffSessionMetrics> {
  const { data } = await apiRequest(`/staff/sessions/${encodeURIComponent(sessionId)}/metrics`, { token, signal });
  if (!isRecord(data) || data.sessionId !== sessionId ||
      typeof data.status !== 'string' || !['OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'].includes(data.status) ||
      !['capacity', 'bookedCount', 'waitingCount', 'servingCount', 'priorityCount', 'patientsCheckedIn'].every(key =>
        Number.isSafeInteger(data[key]) && (data[key] as number) >= 0) ||
      (data.capacity as number) <= 0 || (data.bookedCount as number) > (data.capacity as number) ||
      (data.nowServing !== null && typeof data.nowServing !== 'string')) throw unreadableResponse();
  return data as StaffSessionMetrics;
}

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
  page = 1, signal?: AbortSignal, date?: string): Promise<StaffSessionPage> {
  const filter = date ? `date=${encodeURIComponent(date)}` : `view=${view}`;
  const result = await apiRequest(`/staff/sessions?${filter}&page=${page}&limit=50`, { token, signal });
  if (!Array.isArray(result.data) || typeof result.meta.hasMore !== 'boolean' ||
      typeof result.meta.hospitalId !== 'string' || !/^[a-f\d]{24}$/i.test(result.meta.hospitalId)) throw unreadableResponse();
  return { data: result.data.map(parseSession), hasMore: result.meta.hasMore, hospitalId: result.meta.hospitalId };
}

export async function fetchStaffSession(token: string | undefined, id: string, signal?: AbortSignal) {
  const result = await apiRequest(`/staff/sessions/${encodeURIComponent(id)}`, { token, signal });
  return parseSession(result.data);
}

export type SessionInput = { serviceId: string; sessionDate: string; startTime: string;
  endTime: string; capacity: number; doctorOrTeam: string };

export async function saveStaffSession(token: string | undefined, input: SessionInput,
  sessionId?: string, signal?: AbortSignal) {
  // Explicit allowlist: callers cannot accidentally submit counters or status.
  const body = { serviceId: input.serviceId, sessionDate: input.sessionDate,
    startTime: input.startTime, endTime: input.endTime, capacity: input.capacity,
    doctorOrTeam: input.doctorOrTeam };
  const path = sessionId ? `/staff/sessions/${encodeURIComponent(sessionId)}` : '/staff/sessions';
  const result = await apiRequest(path, { token, method: sessionId ? 'PATCH' : 'POST', body, signal });
  const saved = parseSession(result.data);
  if (sessionId && saved._id !== sessionId) throw unreadableResponse();
  return saved;
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
