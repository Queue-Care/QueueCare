import React from 'react';
import { Alert, AppState, RefreshControl, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { OpdSessionsScreen } from '../src/screens/k_OpdSessionsScreen';
import { fetchStaffSessions, fetchStaffSession, fetchStaffSessionMetrics, closeStaffSessionBookings,
  type StaffOpdSession } from '../src/features/sessions/k_staffSessions';
import { ApiError } from '../src/api/g_apiClient';
import { useSessionWaitingCounts } from '../src/features/sessions/k_useSessionWaitingCounts';

let mockFocused = true;
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (callback: () => (() => void)) => {
    const ReactModule = jest.requireActual('react');
    ReactModule.useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]);
  },
}));
jest.mock('../src/theme/homeFonts', () => ({ useHomeFonts: () => ({ body: 'System', display: 'Georgia', semibold: 'System' }) }));
jest.mock('../src/features/sessions/k_staffSessions', () => ({
  ...jest.requireActual('../src/features/sessions/k_staffSessions'),
  fetchStaffSessions: jest.fn(), fetchStaffSession: jest.fn(), closeStaffSessionBookings: jest.fn(), fetchStaffSessionMetrics: jest.fn(),
}));
const list = jest.mocked(fetchStaffSessions), metrics = jest.mocked(fetchStaffSessionMetrics);
const session: StaffOpdSession = { _id: '000000000000000000000101', hospitalId: '000000000000000000000001',
  serviceId: null, serviceName: 'General OPD', doctorOrTeam: 'Team', sessionDate: '2026-10-06',
  startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 19, status: 'OPEN' };
let renderer: Renderer.ReactTestRenderer;
let appListener: (state: 'active' | 'background' | 'inactive') => void;
const remove = jest.fn(), add = jest.fn(), edit = jest.fn(), expired = jest.fn();
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
const result = (waitingCount: number) => ({ sessionId: session._id, status: 'OPEN' as const, capacity: 50,
  bookedCount: 19, waitingCount, servingCount: 0, priorityCount: 0, patientsCheckedIn: 30, nowServing: null });
const page = (data: StaffOpdSession[], hasMore = false) => ({ data, hasMore, hospitalId: session.hospitalId });
const props = (extra = {}) => ({ accessToken: 'staff-token', onAdd: add, onEdit: edit, onSessionExpired: expired, ...extra });
async function mount(extra = {}) { await act(async () => { renderer = Renderer.create(<OpdSessionsScreen {...props(extra)} />); }); }
async function update(extra = {}) { await act(async () => renderer.update(<OpdSessionsScreen {...props(extra)} />)); }
async function tick(ms = 10000) { await act(async () => jest.advanceTimersByTime(ms)); }
function texts() { return renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' '); }
async function press(label: string) {
  const target = renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  await act(async () => target.props.onPress());
}
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-06T03:00Z') }); jest.clearAllMocks(); mockFocused = true;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appListener = listener; return { remove };
  });
  list.mockResolvedValue(page([session])); metrics.mockReset(); metrics.mockResolvedValue(result(3));
  jest.mocked(fetchStaffSession).mockResolvedValue(session);
  jest.mocked(closeStaffSessionBookings).mockResolvedValue({ ...session, status: 'CLOSED' });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  jest.restoreAllMocks(); jest.useRealTimers();
  if (originalAppState) Object.defineProperty(AppState, 'currentState', originalAppState);
});

test('initial loading text never derives a count from bookings', async () => {
  metrics.mockImplementation(() => new Promise(() => {})); await mount();
  expect(texts()).toContain('Loading waiting count…'); expect(texts()).not.toContain('19 waiting');
});
test.each([0, 1, 3])('real %s waiting has service accessibility context', async count => {
  metrics.mockResolvedValue(result(count)); await mount(); expect(texts()).toContain(`${count} waiting`);
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === `General OPD: ${count} ${count === 1 ? 'patient' : 'patients'} waiting`)).not.toHaveLength(0);
});
test('failure, stale previous count, and recovery', async () => {
  metrics.mockRejectedValueOnce(new Error('offline')); await mount();
  expect(texts()).toContain('Waiting count unavailable'); expect(texts()).not.toContain('0 waiting');
  await tick(); expect(texts()).toContain('3 waiting');
  metrics.mockRejectedValueOnce(new Error('offline')); await tick();
  expect(texts()).toContain('3 waiting'); expect(texts()).toContain('Last updated');
  metrics.mockResolvedValue(result(5)); await tick(); expect(texts()).toContain('5 waiting'); expect(texts()).not.toContain('Last updated');
});
test('immediate focus fetch, exact cadence, no overlapping cycles, blur/refocus cleanup', async () => {
  let resolve!: (value: ReturnType<typeof result>) => void;
  metrics.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); expect(metrics).toHaveBeenCalledTimes(1);
  await tick(30000); expect(metrics).toHaveBeenCalledTimes(1);
  await act(async () => resolve(result(2))); await tick(9999); expect(metrics).toHaveBeenCalledTimes(1);
  await tick(1); expect(metrics).toHaveBeenCalledTimes(2);
  const signal = metrics.mock.calls[1][2]!;
  mockFocused = false; await update(); expect(signal.aborted).toBe(true);
  await tick(30000); expect(metrics).toHaveBeenCalledTimes(2);
  mockFocused = true; await update(); expect(metrics).toHaveBeenCalledTimes(3);
});
test('background aborts and active resumes immediately', async () => {
  await mount(); const signal = metrics.mock.calls[0][2]!;
  await act(async () => appListener('background')); expect(signal.aborted).toBe(true);
  await tick(30000); expect(metrics).toHaveBeenCalledTimes(1);
  await act(async () => appListener('active')); expect(metrics).toHaveBeenCalledTimes(2);
  await tick(); expect(metrics).toHaveBeenCalledTimes(3);
});
test('initial background state defers polling until active', async () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
  await mount(); expect(metrics).not.toHaveBeenCalled();
  await tick(30000); expect(metrics).not.toHaveBeenCalled();
  await act(async () => appListener('active')); expect(metrics).toHaveBeenCalledTimes(1);
});
test('Colombo midnight removes yesterday from the live request set', async () => {
  jest.setSystemTime(new Date('2026-10-06T18:29:55Z')); await mount();
  expect(metrics).toHaveBeenCalledTimes(1); await tick();
  expect(metrics).toHaveBeenCalledTimes(1); expect(texts()).not.toContain('3 waiting');
});
test('unmount aborts and removes app-state subscription', async () => {
  await mount(); const signal = metrics.mock.calls[0][2]!;
  await act(async () => renderer.unmount()); expect(signal.aborted).toBe(true); expect(remove).toHaveBeenCalled();
  await tick(); expect(metrics).toHaveBeenCalledTimes(1);
});
test('multiple independent results and bounded concurrency of four', async () => {
  const sessions = Array.from({ length: 6 }, (_, i) => ({ ...session, _id: (200 + i).toString(16).padStart(24, '0'), serviceName: `Service ${i}` }));
  list.mockResolvedValue(page(sessions));
  const pending: ((value: ReturnType<typeof result>) => void)[] = [];
  metrics.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  await mount(); expect(metrics).toHaveBeenCalledTimes(4);
  await act(async () => pending[0](result(0))); expect(metrics).toHaveBeenCalledTimes(5);
  await act(async () => pending[1](result(1))); expect(metrics).toHaveBeenCalledTimes(6);
  await act(async () => pending.slice(2).forEach((resolve, i) => resolve(result(i + 2))));
  expect(metrics).toHaveBeenCalledTimes(6); expect(texts()).toContain('0 waiting'); expect(texts()).toContain('1 waiting');
});
test('duplicate session IDs issue one metrics request', async () => {
  function Harness() {
    const values = useSessionWaitingCounts([session, session], 'staff-token');
    return <Text>{JSON.stringify(values)}</Text>;
  }
  await act(async () => { renderer = Renderer.create(<Harness />); });
  expect(metrics).toHaveBeenCalledTimes(1);
});
test('one failed session does not discard another result', async () => {
  list.mockResolvedValue(page([session, { ...session, _id: '000000000000000000000102' }]));
  metrics.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(result(7)); await mount();
  expect(texts()).toContain('Waiting count unavailable'); expect(texts()).toContain('7 waiting');
});
test.each(['OPEN', 'CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'] as const)('%s display policy', async status => {
  list.mockResolvedValue(page([{ ...session, status }])); await mount();
  expect(metrics).toHaveBeenCalledTimes(['OPEN', 'CLOSED', 'RUNNING'].includes(status) ? 1 : 0);
});
test.each(['2026-10-06', '2026-10-07'])('saved-date %s policy', async savedSessionDate => {
  list.mockResolvedValue(page([{ ...session, sessionDate: savedSessionDate }])); await mount({ savedSessionDate });
  expect(metrics).toHaveBeenCalledTimes(savedSessionDate === '2026-10-06' ? 1 : 0);
});
test('Upcoming aborts old requests and obsolete responses cannot overwrite counts', async () => {
  let resolve!: (value: ReturnType<typeof result>) => void;
  metrics.mockImplementationOnce(() => new Promise(done => { resolve = done; })); await mount();
  const signal = metrics.mock.calls[0][2]!;
  list.mockResolvedValue(page([{ ...session, sessionDate: '2026-10-07' }])); await press('Upcoming');
  expect(signal.aborted).toBe(true); await act(async () => resolve(result(99)));
  await tick(); expect(metrics).toHaveBeenCalledTimes(1); expect(texts()).not.toContain('99 waiting');
});
test('page changes replace requests and cached counts', async () => {
  list.mockResolvedValueOnce(page([session], true)); await mount();
  const signal = metrics.mock.calls[0][2]!;
  const next = { ...session, _id: '000000000000000000000102', serviceName: 'New service' };
  list.mockResolvedValue(page([next])); metrics.mockResolvedValue(result(8)); await press('Next page');
  expect(signal.aborted).toBe(true); expect(metrics.mock.calls.at(-1)![1]).toBe(next._id);
  expect(texts()).toContain('8 waiting'); expect(texts()).not.toContain('3 waiting');
});
test('saved-date navigation remount clears old metrics and aborts requests', async () => {
  await mount({ savedSessionDate: '2026-10-06' });
  const signal = metrics.mock.calls[0][2]!;
  list.mockResolvedValue(page([{ ...session, sessionDate: '2026-10-07' }]));
  // StaffNavigator already remounts SessionsList using its saveRevision key.
  await act(async () => renderer.update(<OpdSessionsScreen key="new-save" {...props({ savedSessionDate: '2026-10-07' })} />));
  expect(signal.aborted).toBe(true); expect(texts()).not.toContain('3 waiting');
  await tick(); expect(metrics).toHaveBeenCalledTimes(1);
});
test('pull-to-refresh refreshes metrics and removes removed-session cache', async () => {
  await mount(); metrics.mockResolvedValue(result(9));
  await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
  expect(list).toHaveBeenCalledTimes(2); expect(metrics).toHaveBeenCalledTimes(2); expect(texts()).toContain('9 waiting');
  list.mockResolvedValue(page([])); await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
  await tick(); expect(metrics).toHaveBeenCalledTimes(2); expect(texts()).not.toContain('9 waiting');
});
test('token changes abort obsolete requests', async () => {
  await mount(); const signal = metrics.mock.calls[0][2]!;
  await update({ accessToken: 'new-token' }); expect(signal.aborted).toBe(true);
  expect(metrics.mock.calls.at(-1)![0]).toBe('new-token');
});
test('metrics failure leaves Add/Edit/Close and tabs functional', async () => {
  metrics.mockRejectedValue(new Error('offline')); await mount();
  await press('Add a session'); expect(add).toHaveBeenCalledTimes(1);
  await press('Edit session'); expect(edit).toHaveBeenCalledWith(session._id);
  const alert = jest.spyOn(Alert, 'alert'); await press('Close bookings');
  const buttons = alert.mock.calls[0][2]!; await act(async () => buttons[1].onPress?.());
  expect(closeStaffSessionBookings).toHaveBeenCalled(); expect(texts()).toContain('Bookings closed');
  list.mockResolvedValue(page([])); await press('Upcoming'); expect(texts()).toContain('No upcoming sessions');
});
test('401 uses existing session-expired handling once', async () => {
  metrics.mockRejectedValue(new ApiError('expired', 401)); await mount(); expect(expired).toHaveBeenCalledTimes(1);
  await tick(30000); expect(expired).toHaveBeenCalledTimes(1);
});
