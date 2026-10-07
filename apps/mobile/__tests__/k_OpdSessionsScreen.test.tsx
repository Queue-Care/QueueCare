import React from 'react';
import { Alert, RefreshControl, Text, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { OpdSessionsScreen } from '../src/screens/k_OpdSessionsScreen';
import { closeStaffSessionBookings, fetchStaffSession, fetchStaffSessions, type StaffOpdSession } from '../src/features/sessions/k_staffSessions';
import { ApiError } from '../src/api/g_apiClient';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (callback: () => (() => void)) => {
    const ReactModule = jest.requireActual('react');
    ReactModule.useEffect(callback, [callback]);
  },
}));
jest.mock('../src/theme/homeFonts', () => ({ useHomeFonts: () => ({ body: 'System', display: 'Georgia', semibold: 'System' }) }));
jest.mock('../src/features/sessions/k_staffSessions', () => ({
  ...jest.requireActual('../src/features/sessions/k_staffSessions'),
  fetchStaffSessions: jest.fn(), fetchStaffSession: jest.fn(), closeStaffSessionBookings: jest.fn(),
  fetchStaffSessionMetrics: jest.fn().mockResolvedValue({ waitingCount: 0 }),
}));
const list = jest.mocked(fetchStaffSessions), detail = jest.mocked(fetchStaffSession), close = jest.mocked(closeStaffSessionBookings);
const session: StaffOpdSession = { _id: '000000000000000000000101', hospitalId: '000000000000000000000001',
  serviceId: '000000000000000000000011', serviceName: 'General OPD', doctorOrTeam: 'OPD team',
  sessionDate: '2026-10-06', startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 4, status: 'OPEN' };
let renderer: Renderer.ReactTestRenderer;
const onAdd = jest.fn(), onEdit = jest.fn(), expired = jest.fn();
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-06T02:00:00Z') });
  jest.clearAllMocks();
  list.mockResolvedValue({ data: [session], hasMore: false, hospitalId: '000000000000000000000001' });
  detail.mockResolvedValue(session);
  close.mockResolvedValue({ ...session, status: 'CLOSED' });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.useRealTimers(); });
async function mount() {
  await act(async () => { renderer = Renderer.create(<OpdSessionsScreen accessToken="staff-token" onAdd={onAdd}
    onEdit={onEdit} onSessionExpired={expired} />); });
}
function button(label: string) {
  return renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').pop()!;
}
async function press(label: string) { await act(async () => button(label).props.onPress()); }
function text(value: string) { return renderer.root.findAllByType(Text).some(node => node.props.children === value); }
async function search(query: string) {
  await act(async () => renderer.root.findByType(TextInput).props.onChangeText(query));
}

test('Today search opens accessibly, filters doctor/team case-insensitively, and clears or closes', async () => {
  list.mockResolvedValue({ data: [session, { ...session, _id: '000000000000000000000102',
    serviceName: 'Dermatology', doctorOrTeam: 'Dr Perera' }], hasMore: false, hospitalId: session.hospitalId });
  await mount();
  expect(button('Search sessions')).toBeDefined();
  expect(text('OPD sessions')).toBe(true);
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  await press('Search sessions');
  expect(renderer.root.findByType(TextInput).props.accessibilityLabel).toBe('Search sessions');
  expect(renderer.root.findByType(TextInput).props.placeholder).toBe('Search sessions');
  await search('  opd TEAM  ');
  expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(false);
  await search('dr');
  expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(false);
  await search('  PERERA ');
  expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(false);
  await press('Clear search');
  expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(true);
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  await search('opd'); await press('Close search');
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(true);
  expect(list).toHaveBeenCalledTimes(1);
  expect(detail).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});

test('Today excludes service names and dates, while blank queries retain all sessions including unavailable teams', async () => {
  list.mockResolvedValue({ data: [session, { ...session, _id: '000000000000000000000102',
    serviceName: 'Dermatology', doctorOrTeam: null }], hasMore: false, hospitalId: session.hospitalId });
  await mount(); await press('Search sessions');
  for (const query of ['General', '2026-10-06', '6 Oct 2026', 'missing doctor']) {
    await search(query);
    expect(text('No sessions match your search.')).toBe(true);
    expect(text('General OPD')).toBe(false); expect(text('Dermatology')).toBe(false);
  }
  for (const query of ['', '   ']) {
    await search(query);
    expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(true);
    expect(text('No sessions match your search.')).toBe(false);
  }
  expect(list).toHaveBeenCalledTimes(1);
});

test.each(['  PERERA  ', '7 Oct 2026', '  7 oCT  ', 'Oct', '2026-10-07', '2026-10'])
  ('Upcoming filters the loaded list by doctor/team or actual calendar date: %s', async query => {
    await mount();
    list.mockResolvedValueOnce({ data: [
      { ...session, serviceName: 'Dermatology', doctorOrTeam: 'Dr Perera', sessionDate: '2026-10-07' },
      { ...session, _id: '000000000000000000000102', serviceName: 'General OPD',
        doctorOrTeam: 'Clinic team', sessionDate: '2026-11-01' },
    ], hasMore: false, hospitalId: session.hospitalId });
    await press('Upcoming'); await press('Search sessions'); await search(query);
    expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(false);
    await press('Clear search');
    expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(true);
    await search('   ');
    expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
    expect(detail).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });

test('Upcoming date matching preserves month/year boundary calendar days without timezone shifts', async () => {
  await mount();
  list.mockResolvedValueOnce({ data: [
    { ...session, serviceName: 'Year end', doctorOrTeam: null, sessionDate: '2026-12-31' },
    { ...session, _id: '000000000000000000000102', serviceName: 'New year',
      doctorOrTeam: null, sessionDate: '2027-01-01' },
  ], hasMore: false, hospitalId: session.hospitalId });
  await press('Upcoming'); await press('Search sessions'); await search('1 Jan 2027');
  expect(text('New year')).toBe(true); expect(text('Year end')).toBe(false);
  await search('31 Dec 2026');
  expect(text('Year end')).toBe(true); expect(text('New year')).toBe(false);
  await search('2027-01-01');
  expect(text('New year')).toBe(true); expect(text('Year end')).toBe(false);
});

test('search no-results state and empty query preserve normal empty states', async () => {
  await mount(); await press('Search sessions'); await search('missing');
  expect(text('No sessions match your search.')).toBe(true);
  expect(text('General OPD')).toBe(false); expect(text('No sessions today')).toBe(false);
  await press('Clear search');
  expect(text('No sessions match your search.')).toBe(false); expect(text('General OPD')).toBe(true);
  list.mockResolvedValue({ data: [], hasMore: false, hospitalId: session.hospitalId });
  await press('Upcoming'); await press('Search sessions'); await search('missing');
  expect(text('No sessions match your search.')).toBe(true);
  await search('   ');
  expect(text('No upcoming sessions')).toBe(true); expect(text('No sessions match your search.')).toBe(false);
});

test('switching tabs resets search and filters only the currently loaded tab', async () => {
  await mount(); await press('Search sessions'); await search('opd');
  list.mockResolvedValueOnce({ data: [{ ...session, serviceName: 'Dermatology', sessionDate: '2026-10-07' }],
    hasMore: false, hospitalId: session.hospitalId });
  await press('Upcoming');
  expect(list).toHaveBeenLastCalledWith('staff-token', 'upcoming', 1, expect.any(AbortSignal));
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(false);
  await press('Search sessions'); await search('perera');
  expect(text('No sessions match your search.')).toBe(true);
  await press('Today');
  expect(list).toHaveBeenLastCalledWith('staff-token', 'today', 1, expect.any(AbortSignal));
  expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(false);
});
test('Today and Upcoming load real helpers and support pagination and refresh', async () => {
  list.mockResolvedValue({ data: [session], hasMore: true, hospitalId: '000000000000000000000001' });
  await mount();
  expect(list).toHaveBeenCalledWith('staff-token', 'today', 1, expect.any(AbortSignal));
  expect(text('General OPD')).toBe(true);
  await press('Next page');
  expect(list).toHaveBeenLastCalledWith('staff-token', 'today', 2, expect.any(AbortSignal));
  await press('Upcoming');
  expect(list).toHaveBeenLastCalledWith('staff-token', 'upcoming', 1, expect.any(AbortSignal));
  await act(async () => renderer.root.findByType(RefreshControl).props.onRefresh());
  expect(list).toHaveBeenCalledTimes(4);
});
test('loading, retry, error and distinct empty states are usable', async () => {
  list.mockImplementationOnce(() => new Promise(() => {}));
  await mount();
  expect(text('Loading sessions…')).toBe(true);
  list.mockRejectedValueOnce(new ApiError('Connection unavailable.'));
  await press('Upcoming');
  expect(text('Connection unavailable.')).toBe(true);
  list.mockResolvedValue({ data: [], hasMore: false, hospitalId: '000000000000000000000001' });
  await press('Try again');
  expect(text('No upcoming sessions')).toBe(true);
  await press('Today');
  expect(text('No sessions today')).toBe(true);
});
test('Add navigation and Edit detail handoff work without implementing a form', async () => {
  await mount();
  await press('Add a session'); expect(onAdd).toHaveBeenCalledTimes(1);
  await press('Edit session');
  expect(detail).toHaveBeenCalledWith('staff-token', session._id, expect.any(AbortSignal));
  expect(onEdit).toHaveBeenCalledWith(session._id);
});
test('closure waits for confirmation, prevents duplicates, then refreshes server state', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount();
  await press('Close bookings'); await press('Close bookings');
  expect(alert).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  const confirm = alert.mock.calls[0][2]![1].onPress!;
  let resolve!: (value: StaffOpdSession) => void;
  close.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => confirm());
  await act(async () => button('Close bookings').props.onPress());
  expect(close).toHaveBeenCalledTimes(1);
  list.mockResolvedValue({ data: [{ ...session, status: 'CLOSED' }], hasMore: false, hospitalId: '000000000000000000000001' });
  await act(async () => resolve({ ...session, status: 'CLOSED' }));
  expect(text('Bookings closed')).toBe(true);
  expect(text('Bookings closed. Existing bookings remain valid.')).toBe(true);
  expect(button('Close bookings')).toBeUndefined();
  alert.mockRestore();
});
test('cancel and failure keep OPEN state; unauthorized errors invoke the existing sign-out callback', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount(); await press('Close bookings');
  await act(async () => alert.mock.calls[0][2]![0].onPress!());
  expect(close).not.toHaveBeenCalled();
  close.mockRejectedValueOnce(new ApiError('Please sign in again.', 401));
  await press('Close bookings');
  await act(async () => alert.mock.calls[1][2]![1].onPress!());
  expect(expired).toHaveBeenCalledTimes(1);
  expect(text('Please sign in again.')).toBe(true);
  expect(text('Open')).toBe(true);
  expect(button('Close bookings')).toBeDefined();
  alert.mockRestore();
});
test.each(['CLOSED', 'RUNNING', 'COMPLETED', 'CANCELLED'] as const)('%s sessions do not offer closure', async status => {
  list.mockResolvedValue({ data: [{ ...session, status }], hasMore: false, hospitalId: '000000000000000000000001' });
  await mount(); expect(button('Close bookings')).toBeUndefined();
});


test.each([
  ['2026-10-07', '2026-10-06T06:00:00Z', true],
  ['2026-10-06', '2026-10-06T02:00:00Z', true],
  ['2026-10-06', '2026-10-06T06:00:00Z', true],
  ['2026-10-06', '2026-10-06T06:59:59.999Z', true],
  ['2026-10-06', '2026-10-06T07:00:00Z', true],
  ['2026-10-06', '2026-10-06T07:00:00.001Z', false],
  ['2026-10-05', '2026-10-06T02:00:00Z', false],
])('session date %s at %s has Edit availability %s', async (sessionDate, now, editable) => {
  jest.setSystemTime(new Date(now));
  list.mockResolvedValueOnce({ data: [{ ...session, sessionDate }], hasMore: false, hospitalId: session.hospitalId });
  await mount(); expect(!!button('Edit session')).toBe(editable);
  expect(text('General OPD')).toBe(true);
  expect(button('Close bookings')).toBeDefined();
});

test('Edit disappears just after scheduled end without changing session or other actions', async () => {
  jest.setSystemTime(new Date('2026-10-06T06:59:59.999Z'));
  await mount(); expect(button('Edit session')).toBeDefined();
  await act(async () => jest.advanceTimersByTime(2));
  expect(button('Edit session')).toBeUndefined(); expect(button('Close bookings')).toBeDefined();
  expect(close).not.toHaveBeenCalled(); expect(text('General OPD')).toBe(true);
});

test('fresh detail prevents stale Edit handoff for ended session', async () => {
  await mount(); detail.mockResolvedValueOnce({ ...session, sessionDate: '2026-10-05' });
  await press('Edit session'); expect(onEdit).not.toHaveBeenCalled();
  expect(text('This session has ended and can no longer be edited.')).toBe(true);
});
