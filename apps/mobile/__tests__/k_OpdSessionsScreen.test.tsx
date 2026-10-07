import React from 'react';
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Renderer, { act } from 'react-test-renderer';
import { OpdSessionsScreen } from '../src/screens/k_OpdSessionsScreen';
import { closeStaffSessionBookings, fetchStaffSession, fetchStaffSessions, type StaffOpdSession } from '../src/features/sessions/k_staffSessions';
import { ApiError } from '../src/api/g_apiClient';

jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.useRealTimers(); jest.restoreAllMocks(); });
async function mount(targetSessionId?: string) {
  await act(async () => { renderer = Renderer.create(<OpdSessionsScreen accessToken="staff-token" onAdd={onAdd}
    targetSessionId={targetSessionId} onEdit={onEdit} onSessionExpired={expired} />); });
}
function button(label: string) {
  return renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').pop()!;
}
async function press(label: string) { await act(async () => button(label).props.onPress()); }
function text(value: string) { return renderer.root.findAllByType(Text).some(node => node.props.children === value); }
async function search(query: string) {
  await act(async () => renderer.root.findByType(TextInput).props.onChangeText(query));
}

test('Today search opens accessibly, filters service and doctor/team case-insensitively, and clears or closes', async () => {
  list.mockResolvedValue({ data: [session, { ...session, _id: '000000000000000000000102',
    serviceName: 'Dermatology', doctorOrTeam: 'Dr Perera' }], hasMore: false, hospitalId: session.hospitalId });
  await mount();
  expect(button('Search sessions')).toBeDefined();
  expect(text('OPD sessions')).toBe(true);
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  await press('Search sessions');
  expect(renderer.root.findByType(TextInput).props.accessibilityLabel).toBe('Search sessions by session name, doctor, or clinic team');
  expect(renderer.root.findByType(TextInput).props.placeholder).toBe('Search by session or doctor');
  for (const query of ['general', 'GENERAL', '  gen  ']) {
    await search(query);
    expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(false);
  }
  await search('  DERM  ');
  expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(false);
  await search('  opd TEAM  ');
  expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(false);
  await search('dr');
  expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(false);
  await search('  PERERA ');
  expect(text('Dermatology')).toBe(true); expect(text('General OPD')).toBe(false);
  await press('Clear search');
  expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(true);
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  await search('opd'); await press('Close session search');
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  expect(text('General OPD')).toBe(true); expect(text('Dermatology')).toBe(true);
  expect(list).toHaveBeenCalledTimes(1);
  expect(detail).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});

test('text search excludes dates, while blank queries retain all sessions including unavailable teams', async () => {
  list.mockResolvedValue({ data: [session, { ...session, _id: '000000000000000000000102',
    serviceName: 'Dermatology', doctorOrTeam: null }], hasMore: false, hospitalId: session.hospitalId });
  await mount(); await press('Search sessions');
  for (const query of ['2026-10-06', '6 Oct 2026', 'missing doctor']) {
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

async function selectDate(day: string) {
  await press('Filter sessions by date');
  expect(renderer.root.findByType(DateTimePicker).props.timeZoneName).toBe('Asia/Colombo');
  await act(async () => renderer.root.findByType(DateTimePicker).props.onValueChange({}, new Date(`${day}T00:00:00+05:30`)));
  if (Platform.OS === 'ios') await press('Apply date filter');
}

test.each(['Today', 'Upcoming'] as const)('%s searches actual service names or doctor/team with partial trimmed queries', async tab => {
  const day = tab === 'Today' ? '2026-10-06' : '2026-10-08';
  list.mockResolvedValue({ data: [
    { ...session, sessionDate: day, serviceName: 'General OPD', doctorOrTeam: 'Dr Nalin Pushpakumara' },
    { ...session, _id: '000000000000000000000102', sessionDate: day, serviceName: 'Medical clinic', doctorOrTeam: 'testing' },
    { ...session, _id: '000000000000000000000103', sessionDate: day, serviceName: 'Dermatology Clinic', doctorOrTeam: 'Dr S Dilrukshi' },
  ], hasMore: false, hospitalId: session.hospitalId });
  await mount();
  if (tab === 'Upcoming') await press('Upcoming');
  await press('Search sessions');
  for (const [query, expected] of [
    ['general', 'General OPD'], ['GENERAL', 'General OPD'], ['  gen  ', 'General OPD'],
    ['medical', 'Medical clinic'], ['  DERM  ', 'Dermatology Clinic'],
    ['nalin', 'General OPD'], ['dil', 'Dermatology Clinic'], ['  TESTING  ', 'Medical clinic'],
  ]) {
    await search(query);
    for (const name of ['General OPD', 'Medical clinic', 'Dermatology Clinic']) expect(text(name)).toBe(name === expected);
  }
  await search('absent'); expect(text('No sessions match your search.')).toBe(true);
  await press('Clear search');
  for (const name of ['General OPD', 'Medical clinic', 'Dermatology Clinic']) expect(text(name)).toBe(true);
  expect(text('No sessions match your search.')).toBe(false);
});

test.each(['ios', 'android'] as const)('Upcoming filters combine with AND and clear independently on %s', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  await mount();
  expect(button('Filter sessions by date')).toBeUndefined();
  list.mockResolvedValueOnce({ data: [
    { ...session, serviceName: 'Nalin Oct 8', doctorOrTeam: 'Dr Nalin', sessionDate: '2026-10-08' },
    { ...session, _id: '000000000000000000000102', serviceName: 'Nalin Oct 9', doctorOrTeam: 'Dr Nalin', sessionDate: '2026-10-09' },
    { ...session, _id: '000000000000000000000103', serviceName: 'Perera Oct 8', doctorOrTeam: 'Dr Perera', sessionDate: '2026-10-08' },
  ], hasMore: false, hospitalId: session.hospitalId });
  await press('Upcoming'); await press('Search sessions');
  expect(button('Close search')).toBeUndefined();
  expect(button('Filter sessions by date')).toBeDefined();
  await search('  nAL  ');
  expect(text('Nalin Oct 8')).toBe(true); expect(text('Nalin Oct 9')).toBe(true); expect(text('Perera Oct 8')).toBe(false);
  await selectDate('2026-10-08');
  expect(renderer.root.findAllByType(Text).some(node => React.Children.toArray(node.props.children).join('') === 'Date: 8 Oct 2026')).toBe(true);
  expect(text('Nalin Oct 8')).toBe(true); expect(text('Nalin Oct 9')).toBe(false); expect(text('Perera Oct 8')).toBe(false);
  await search('  OCT  ');
  expect(text('Nalin Oct 8')).toBe(true); expect(text('Perera Oct 8')).toBe(true); expect(text('Nalin Oct 9')).toBe(false);
  await search('nal');
  await press('Clear date filter');
  expect(text('Nalin Oct 9')).toBe(true); expect(text('Perera Oct 8')).toBe(false);
  await selectDate('2026-10-08'); await press('Clear search');
  expect(text('Nalin Oct 8')).toBe(true); expect(text('Perera Oct 8')).toBe(true); expect(text('Nalin Oct 9')).toBe(false);
  await selectDate('2026-10-10'); expect(text('No sessions match your search.')).toBe(true);
  await press('Clear date filter'); await search('   ');
  for (const title of ['Nalin Oct 8', 'Nalin Oct 9', 'Perera Oct 8']) expect(text(title)).toBe(true);
  await selectDate('2026-10-08'); await search('nal'); await press('Close session search');
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  expect(button('Close search')).toBeUndefined();
  for (const title of ['Nalin Oct 8', 'Nalin Oct 9', 'Perera Oct 8']) expect(text(title)).toBe(true);
  await press('Search sessions'); await selectDate('2026-10-08'); await press('Today');
  expect(text('General OPD')).toBe(true); expect(renderer.root.findAllByType(DateTimePicker)).toHaveLength(0);
  expect(button('Clear date filter')).toBeUndefined();
  expect(list).toHaveBeenCalledTimes(3);
  expect(detail).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});

test('Upcoming service-name OR doctor matching combines with the exact future date using AND', async () => {
  await mount();
  list.mockResolvedValueOnce({ data: [
    { ...session, serviceName: 'General OPD', doctorOrTeam: 'Dr Nalin', sessionDate: '2026-10-08' },
    { ...session, _id: '000000000000000000000102', serviceName: 'General OPD', doctorOrTeam: 'Dr Perera', sessionDate: '2026-10-09' },
    { ...session, _id: '000000000000000000000103', serviceName: 'Medical clinic', doctorOrTeam: 'Dr Nalin', sessionDate: '2026-10-08' },
  ], hasMore: false, hospitalId: session.hospitalId });
  await press('Upcoming'); await press('Search sessions'); await search('  GENERAL '); await selectDate('2026-10-09');
  expect(text('General OPD')).toBe(true); expect(text('Dr Perera')).toBe(true);
  expect(text('Dr Nalin')).toBe(false); expect(text('Medical clinic')).toBe(false);
  await search('nAl'); await selectDate('2026-10-08');
  expect(text('General OPD')).toBe(true); expect(text('Medical clinic')).toBe(true);
  expect(text('Dr Perera')).toBe(false);
  await selectDate('2026-10-09'); expect(text('No sessions match your search.')).toBe(true);
  await press('Clear search'); expect(text('Dr Perera')).toBe(true); expect(text('Dr Nalin')).toBe(false);
});

test('calendar dismissal leaves filters unchanged and selection retains Colombo month/year calendar days', async () => {
  await mount();
  list.mockResolvedValueOnce({ data: [
    { ...session, serviceName: 'Year end', doctorOrTeam: null, sessionDate: '2026-12-31' },
    { ...session, _id: '000000000000000000000102', serviceName: 'New year', doctorOrTeam: null, sessionDate: '2027-01-01' },
  ], hasMore: false, hospitalId: session.hospitalId });
  await press('Upcoming'); await press('Search sessions'); await press('Filter sessions by date');
  await act(async () => renderer.root.findByType(DateTimePicker).props.onDismiss());
  expect(text('Year end')).toBe(true); expect(text('New year')).toBe(true);
  await selectDate('2027-01-01');
  expect(text('New year')).toBe(true); expect(text('Year end')).toBe(false);
  await selectDate('2026-12-31');
  expect(text('Year end')).toBe(true); expect(text('New year')).toBe(false);
  expect(list).toHaveBeenCalledTimes(2);
});

test.each(['ios', 'android'] as const)('Upcoming excludes past/today rows and rejects nonfuture picker values on %s', async platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  await mount();
  expect(text('General OPD')).toBe(true);
  list.mockResolvedValueOnce({ data: [
    { ...session, serviceName: 'Yesterday', sessionDate: '2026-10-05' },
    { ...session, _id: '000000000000000000000102', serviceName: 'Today clinic', sessionDate: '2026-10-06' },
    { ...session, _id: '000000000000000000000103', serviceName: 'Tomorrow', sessionDate: '2026-10-07', doctorOrTeam: 'Dr Nalin' },
    { ...session, _id: '000000000000000000000104', serviceName: 'Later', sessionDate: '2026-10-08', doctorOrTeam: 'Dr Perera' },
  ], hasMore: false, hospitalId: session.hospitalId });
  await press('Upcoming'); await press('Search sessions');
  expect(text('Yesterday')).toBe(false); expect(text('Today clinic')).toBe(false);
  expect(text('Tomorrow')).toBe(true); expect(text('Later')).toBe(true);
  for (const day of ['2026-10-05', '2026-10-06']) {
    await selectDate(day);
    expect(button('Clear date filter')).toBeUndefined();
    expect(text('Yesterday')).toBe(false); expect(text('Today clinic')).toBe(false);
    expect(text('Tomorrow')).toBe(true); expect(text('Later')).toBe(true);
  }
  await search('  nAL  '); await selectDate('2026-10-07');
  expect(text('Tomorrow')).toBe(true); expect(text('Later')).toBe(false);
  expect(list).toHaveBeenCalledTimes(2);
  await press('Today'); expect(text('General OPD')).toBe(true);
});

test.each([
  ['2026-10-06T18:29:59Z', '2026-10-07'],
  ['2026-10-06T18:30:00Z', '2026-10-08'],
  ['2026-12-31T18:30:00Z', '2027-01-02'],
])('picker minimum at %s is tomorrow %s in Colombo', async (now, tomorrow) => {
  jest.setSystemTime(new Date(now));
  await mount(); await press('Upcoming'); await press('Search sessions'); await press('Filter sessions by date');
  const picker = renderer.root.findByType(DateTimePicker).props;
  expect(picker.timeZoneName).toBe('Asia/Colombo');
  expect(picker.minimumDate.toISOString()).toBe(new Date(`${tomorrow}T00:00:00+05:30`).toISOString());
  expect(picker.value.toISOString()).toBe(new Date(`${tomorrow}T12:00:00+05:30`).toISOString());
});

test('a selected date that becomes stale at Colombo midnight is ignored without revealing historical sessions', async () => {
  jest.setSystemTime(new Date('2026-10-06T18:29:59Z'));
  await mount();
  list.mockResolvedValueOnce({ data: [
    { ...session, serviceName: 'Oct 7', sessionDate: '2026-10-07' },
    { ...session, _id: '000000000000000000000102', serviceName: 'Oct 8', sessionDate: '2026-10-08' },
  ], hasMore: false, hospitalId: session.hospitalId });
  await press('Upcoming'); await press('Search sessions'); await selectDate('2026-10-07');
  expect(text('Oct 7')).toBe(true); expect(text('Oct 8')).toBe(false);
  await act(async () => jest.advanceTimersByTime(1001));
  expect(text('Oct 7')).toBe(false); expect(text('Oct 8')).toBe(true);
  expect(button('Clear date filter')).toBeUndefined();
  await act(async () => jest.advanceTimersByTime(86400000));
  expect(text('Oct 7')).toBe(false); expect(text('Oct 8')).toBe(false);
  expect(text('No upcoming sessions')).toBe(true);
});

test.each(['OPEN', 'RUNNING'] as const)('%s badge retains its intended semantic colors', async status => {
  list.mockResolvedValueOnce({ data: [{ ...session, status }], hasMore: false, hospitalId: session.hospitalId });
  await mount();
  const label = renderer.root.findAllByType(Text).find(node => node.props.children === (status === 'OPEN' ? 'Open' : 'Running'))!;
  const badge = StyleSheet.flatten(label.parent!.props.style);
  expect(badge.backgroundColor).toBe('#E4F0EC');
  if (status === 'OPEN') expect(badge.borderColor).toBe('#0A4F45');
  expect(StyleSheet.flatten(label.props.style).color).toBe(status === 'OPEN' ? '#0A4F45' : '#17302A');
});

test('target ID selects its actual Upcoming page and reveals that exact card without filters', async () => {
  const target = { ...session, _id: '000000000000000000000102', serviceName: 'Target clinic', sessionDate: '2026-10-08' };
  detail.mockResolvedValueOnce(target);
  list.mockResolvedValueOnce({ data: [session], hasMore: true, hospitalId: session.hospitalId });
  list.mockResolvedValueOnce({ data: [target], hasMore: false, hospitalId: session.hospitalId });
  await mount(target._id);
  const scrollTo = renderer.root.findByType(ScrollView).instance.scrollTo;
  expect(detail).toHaveBeenCalledWith('staff-token', target._id, expect.any(AbortSignal));
  expect(list).toHaveBeenLastCalledWith('staff-token', 'upcoming', 2, expect.any(AbortSignal));
  expect(text('Target clinic')).toBe(true); expect(text('Selected session')).toBe(true);
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  const selected = renderer.root.findAllByType(Text).find(node => node.props.children === 'Selected session')!.parent!;
  await act(async () => selected.props.onLayout({ nativeEvent: { layout: { y: 420 } } }));
  expect(scrollTo).toHaveBeenCalledWith({ y: 406, animated: true });
  expect(button('Clear date filter')).toBeUndefined();
  expect(button('Upcoming').props.accessibilityState.selected).toBe(true);
  await press('Today'); expect(text('Selected session')).toBe(false);
});

test('new target navigation clears an existing search and date filter', async () => {
  await mount(); await press('Upcoming'); await press('Search sessions');
  await search('missing'); await selectDate('2026-10-09');
  expect(text('No sessions match your search.')).toBe(true);
  await act(async () => renderer.update(<OpdSessionsScreen accessToken="staff-token" targetSessionId={session._id}
    onAdd={onAdd} onEdit={onEdit} onSessionExpired={expired} />));
  expect(text('General OPD')).toBe(true); expect(text('Selected session')).toBe(true);
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  expect(button('Clear date filter')).toBeUndefined();
  expect(button('Today').props.accessibilityState.selected).toBe(true);
});

test.each(['invalid', undefined])('invalid or absent target %s opens the normal list safely', async target => {
  await mount(target);
  expect(text('General OPD')).toBe(true); expect(text('Selected session')).toBe(false);
  expect(detail).not.toHaveBeenCalled();
});

test('missing target and a target absent from the loaded pages fall back to the normal list', async () => {
  detail.mockRejectedValueOnce(new ApiError('Not found.', 404));
  await mount(session._id); expect(text('General OPD')).toBe(true);
  expect(text('Selected session')).toBe(false);
  await act(async () => renderer.unmount());
  const missingId = '000000000000000000000999';
  detail.mockResolvedValueOnce({ ...session, _id: missingId });
  await mount(missingId);
  expect(text('General OPD')).toBe(true); expect(text('Selected session')).toBe(false);
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
