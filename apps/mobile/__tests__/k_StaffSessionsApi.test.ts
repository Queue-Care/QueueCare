import { ApiError } from '../src/api/g_apiClient';
import { closeStaffSessionBookings, fetchStaffSession, fetchStaffSessions, sessionDayLabel } from '../src/features/sessions/k_staffSessions';

const session = { _id: '000000000000000000000101', hospitalId: '000000000000000000000001',
  serviceId: '000000000000000000000011', serviceName: 'General OPD', doctorOrTeam: 'Team',
  sessionDate: '2026-10-06', startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 4, status: 'OPEN' };
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const fetchMock = jest.fn();
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
function respond(data: unknown, meta = {}) {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data, meta }) });
}
test('list sends the existing JWT and supported view/page filters without hospital scope', async () => {
  respond([session], { hasMore: true });
  expect(await fetchStaffSessions('staff-token', 'today')).toEqual({ data: [session], hasMore: true });
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
