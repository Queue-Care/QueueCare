import React from 'react';
import { Alert, RefreshControl, Text } from 'react-native';
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
}));
const list = jest.mocked(fetchStaffSessions), detail = jest.mocked(fetchStaffSession), close = jest.mocked(closeStaffSessionBookings);
const session: StaffOpdSession = { _id: '000000000000000000000101', hospitalId: '000000000000000000000001',
  serviceId: '000000000000000000000011', serviceName: 'General OPD', doctorOrTeam: 'OPD team',
  sessionDate: '2026-10-06', startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 4, status: 'OPEN' };
let renderer: Renderer.ReactTestRenderer;
const onAdd = jest.fn(), onEdit = jest.fn(), expired = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue({ data: [session], hasMore: false });
  detail.mockResolvedValue(session);
  close.mockResolvedValue({ ...session, status: 'CLOSED' });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
async function mount() {
  await act(async () => { renderer = Renderer.create(<OpdSessionsScreen accessToken="staff-token" onAdd={onAdd}
    onEdit={onEdit} onSessionExpired={expired} />); });
}
function button(label: string) {
  return renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').pop()!;
}
async function press(label: string) { await act(async () => button(label).props.onPress()); }
function text(value: string) { return renderer.root.findAllByType(Text).some(node => node.props.children === value); }
test('Today and Upcoming load real helpers and support pagination and refresh', async () => {
  list.mockResolvedValue({ data: [session], hasMore: true });
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
  list.mockResolvedValue({ data: [], hasMore: false });
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
  list.mockResolvedValue({ data: [{ ...session, status: 'CLOSED' }], hasMore: false });
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
  list.mockResolvedValue({ data: [{ ...session, status }], hasMore: false });
  await mount(); expect(button('Close bookings')).toBeUndefined();
});
