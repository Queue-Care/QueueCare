import { ApiError } from '../src/api/g_apiClient';
import { closeStaffSessionBookings, fetchStaffSession, fetchStaffSessions, fetchStaffSessionMetrics, saveStaffSession, sessionDayLabel } from '../src/features/sessions/k_staffSessions';

const session = { _id: '000000000000000000000101', hospitalId: '000000000000000000000001',
  serviceId: '000000000000000000000011', serviceName: 'General OPD', doctorOrTeam: 'Team',
  sessionDate: '2026-10-06', startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 4, status: 'OPEN' };
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const fetchMock = jest.fn();
const metrics = { sessionId: session._id, status: 'OPEN', capacity: 50, bookedCount: 4,
  waitingCount: 0, servingCount: 0, priorityCount: 0, patientsCheckedIn: 0, nowServing: null };

test.each([0, 1, 3])('metrics accepts real waiting count %s and propagates JWT/signal', async waitingCount => {
  respond({ ...metrics, waitingCount });
  const controller = new AbortController();
  expect((await fetchStaffSessionMetrics('staff-token', session._id, controller.signal)).waitingCount).toBe(waitingCount);
  expect(fetchMock.mock.calls[0][0]).toContain(`/staff/sessions/${session._id}/metrics`);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer staff-token');
  controller.abort();
});
test.each([undefined, null, '0', -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('metrics rejects malformed waiting count %s', async waitingCount => {
  respond({ ...metrics, waitingCount });
  await expect(fetchStaffSessionMetrics('staff-token', session._id)).rejects.toBeInstanceOf(ApiError);
});
test.each([
  { sessionId: 'other' }, { status: 'BAD' }, { status: ['OPEN'] }, { capacity: 0 }, { bookedCount: -1 },
  { servingCount: null }, { priorityCount: '0' }, { patientsCheckedIn: 0.1 }, { nowServing: 123 },
])('metrics rejects malformed identity/counter fields %j', async fields => {
  respond({ ...metrics, ...fields });
  await expect(fetchStaffSessionMetrics('staff-token', session._id)).rejects.toBeInstanceOf(ApiError);
});
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.0.2.1:4000/api/v1/';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
});
function respond(data: unknown, meta: Record<string, unknown> = {}) {
  meta = { hospitalId: session.hospitalId, ...meta };
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data, meta }) });
}
test('list sends the existing JWT and supported view/page filters without hospital scope', async () => {
  respond([session], { hasMore: true });
  expect(await fetchStaffSessions('staff-token', 'today')).toEqual({ data: [session], hasMore: true, hospitalId: session.hospitalId });
  expect(fetchMock.mock.calls[0][0]).toBe('http://192.0.2.1:4000/api/v1/staff/sessions?view=today&page=1&limit=50');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer staff-token');
  await fetchStaffSessions('staff-token', 'upcoming', 2);
  expect(fetchMock.mock.calls[1][0]).toContain('view=upcoming&page=2');
});
test('detail and close use existing paths and closure sends only an empty JSON body', async () => {
  respond(session);
  expect(await fetchStaffSession('staff-token', session._id)).toEqual(session);
  respond({ ...session, status: 'CLOSED' });
  expect((await closeStaffSessionBookings('staff-token', session._id)).status).toBe('CLOSED');
  expect(fetchMock.mock.calls[1][0]).toContain(`/staff/sessions/${session._id}/close-bookings`);
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: '{}' });
});
test('API failures and unreadable closure responses never become a successful local closure', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ success: false,
    error: { code: 'SESSION_CLOSURE_NOT_ALLOWED', message: 'Only open sessions can close.' } }) });
  await expect(closeStaffSessionBookings('staff-token', session._id)).rejects.toMatchObject({ status: 409 });
  respond(session);
  await expect(closeStaffSessionBookings('staff-token', session._id)).rejects.toBeInstanceOf(ApiError);
  respond([{ ...session, sessionDate: '2026-02-29' }], { hasMore: false });
  await expect(fetchStaffSessions('staff-token', 'today')).rejects.toBeInstanceOf(ApiError);
});
test('missing tokens reject without fetching and calendar date labels preserve the day', async () => {
  await expect(fetchStaffSessions(undefined, 'today')).rejects.toBeInstanceOf(ApiError);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(sessionDayLabel('2026-10-06')).toBe('6 Oct 2026');
});
test.each([undefined, session._id])('save sends only six fields using the correct method and path (%s)', async sessionId => {
  respond(session);
  await saveStaffSession('staff-token', { ...session, capacity: 50, serviceId: session.serviceId,
    doctorOrTeam: 'Team', startTime: '08:30', endTime: '12:30' }, sessionId);
  const [path, options] = fetchMock.mock.calls[0];
  expect(path).toBe(`http://192.0.2.1:4000/api/v1/staff/sessions${sessionId ? `/${sessionId}` : ''}`);
  expect(options.method).toBe(sessionId ? 'PATCH' : 'POST');
  expect(JSON.parse(options.body)).toEqual({ serviceId: session.serviceId, sessionDate: session.sessionDate,
    startTime: '08:30', endTime: '12:30', capacity: 50, doctorOrTeam: 'Team' });
});
test('empty staff lists still supply hospital scope and saved-date queries exclude view', async () => {
  respond([], { hasMore: false });
  expect((await fetchStaffSessions('staff-token', 'today')).hospitalId).toBe(session.hospitalId);
  await fetchStaffSessions('staff-token', 'today', 1, undefined, '2026-10-06');
  expect(fetchMock.mock.calls[1][0]).toContain('?date=2026-10-06&page=1&limit=50');
  expect(fetchMock.mock.calls[1][0]).not.toContain('view=');
  respond([], { hasMore: false, hospitalId: null });
  await expect(fetchStaffSessions('staff-token', 'today')).rejects.toBeInstanceOf(ApiError);
});
