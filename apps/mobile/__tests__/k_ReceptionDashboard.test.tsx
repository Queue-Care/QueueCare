import React from 'react';
import { AppState, RefreshControl, Text } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import Renderer, { act } from 'react-test-renderer';
import { StaffNavigator } from '../src/navigation/StaffNavigator';
import type { StaffSummary, StaffTabParams } from '../src/navigation/types';
import { fetchDashboard, parseDashboard, greeting } from '../src/features/staff/g_staffDashboard';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/screens/ProfileScreen', () => ({ ProfileScreen: () => null }));
jest.mock('../src/screens/NotificationsScreen', () => ({ NotificationsScreen: () => null }));
jest.mock('../src/screens/PriorityRequestsScreen', () => ({ PriorityRequestsScreen: () => null }));
jest.mock('../src/screens/PriorityRequestDetailsScreen', () => ({ PriorityRequestDetailsScreen: () => null }));
jest.mock('../src/screens/k_OpdSessionsScreen', () => ({ OpdSessionsScreen: () => null }));
jest.mock('../src/screens/k_AddEditSessionScreen', () => ({ AddEditSessionScreen: () => null }));
jest.mock('../src/theme/homeFonts', () => ({ useHomeFonts: () => ({ body: 'Home-Plex', display: 'Home-Fraunces', semibold: 'Home-Plex-SemiBold' }) }));

const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
const request = jest.fn();
const expired = jest.fn();
const dashboard = {
  staff: { fullName: 'Reception Staff', hospital: 'Hospital One', profileImageUrl: null },
  sessionsToday: 27, priorityWaiting: 4, patientsCheckedIn: 31, nowServing: 'A-029' as string | null, unreadNotifications: 2,
  sessions: [{ _id: 'a'.repeat(24), serviceName: 'General OPD', startsAt: '2026-10-06T03:00:00Z', capacity: 50, bookedCount: 12, label: 'Running' }],
};
let renderer: Renderer.ReactTestRenderer | undefined;
let ref: ReturnType<typeof createNavigationContainerRef<StaffTabParams>>;
function respond(data = dashboard) { return { ok: true, status: 200, json: async () => ({ success: true, data }) }; }
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.test/api/v1';
  globalThis.fetch = request;
  request.mockResolvedValue(respond());
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  if (originalAppState) Object.defineProperty(AppState, 'currentState', originalAppState);
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
});
async function mount(staff?: StaffSummary) {
  ref = createNavigationContainerRef<StaffTabParams>();
  await act(async () => { renderer = Renderer.create(<NavigationContainer ref={ref}>
    <StaffNavigator accessToken="staff-token" staff={staff} onSessionExpired={expired} />
  </NavigationContainer>); });
}
function texts() { return renderer!.root.findAllByType(Text).map(node => node.props.children); }
async function press(label: string) {
  const button = renderer!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').pop()!;
  await act(async () => button.props.onPress());
}
async function refresh() { await act(async () => renderer!.root.findByType(RefreshControl).props.onRefresh()); }

test('real helper sends JWT to the existing endpoint and rejects missing authentication', async () => {
  const signal = new AbortController().signal;
  expect(await fetchDashboard('staff-token', signal)).toMatchObject(dashboard);
  expect(request).toHaveBeenCalledWith('http://api.test/api/v1/staff/dashboard', expect.objectContaining({
    method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer staff-token' }), signal: expect.any(AbortSignal),
  }));
  request.mockClear();
  await expect(fetchDashboard(undefined)).rejects.toThrow('Please sign in again');
  expect(request).not.toHaveBeenCalled();
});

test.each([0, 1, 5])('Priority waiting displays the server pending count %s', async priorityWaiting => {
  request.mockResolvedValue(respond({ ...dashboard, priorityWaiting }));
  await mount();
  const label = renderer!.root.findAllByType(Text).find(node => node.props.children === 'Priority waiting')!;
  expect(label.parent!.findAllByType(Text).map(node => node.props.children)).toContain(priorityWaiting);
});

test('Priority waiting refreshes on polling/focus/foreground and stops on blur/background/unmount', async () => {
  jest.useFakeTimers();
  let count = 0;
  request.mockImplementation(async () => respond({ ...dashboard, priorityWaiting: count }));
  const shown = () => {
    const label = renderer!.root.findAllByType(Text).find(node => node.props.children === 'Priority waiting')!;
    return label.parent!.findAllByType(Text).map(node => node.props.children).at(-1);
  };
  const changeState = async (state: 'active' | 'background') => {
    const listeners = jest.mocked(AppState.addEventListener).mock.calls.filter(call => call[0] === 'change').map(call => call[1]);
    await act(async () => listeners.forEach(listener => listener(state)));
  };
  try {
    await mount(); expect(shown()).toBe(0); expect(request).toHaveBeenCalledTimes(1);
    count = 1;
    await act(async () => jest.advanceTimersByTime(10000)); expect(shown()).toBe(1);
    count = 5;
    await act(async () => jest.advanceTimersByTime(10000)); expect(shown()).toBe(5);
    await changeState('background');
    const beforeBackground = request.mock.calls.length;
    await act(async () => jest.advanceTimersByTime(30000)); expect(request).toHaveBeenCalledTimes(beforeBackground);
    count = 2; await changeState('active'); expect(shown()).toBe(2);
    await act(async () => ref.navigate('Priority'));
    const beforeBlur = request.mock.calls.length;
    await act(async () => jest.advanceTimersByTime(30000)); expect(request).toHaveBeenCalledTimes(beforeBlur);
    count = 0; await act(async () => ref.navigate('Dashboard')); expect(shown()).toBe(0);
    const beforeUnmount = request.mock.calls.length;
    await act(async () => renderer!.unmount()); renderer = undefined;
    await act(async () => jest.advanceTimersByTime(30000)); expect(request).toHaveBeenCalledTimes(beforeUnmount);
  } finally {
    if (renderer) await act(async () => renderer!.unmount()); renderer = undefined;
    jest.restoreAllMocks(); jest.useRealTimers();
  }
});
test('dashboard polling avoids overlapping requests and ignores aborted background results', async () => {
  jest.useFakeTimers();
  let finish!: (value: ReturnType<typeof respond>) => void;
  try {
    await mount();
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => jest.advanceTimersByTime(10000));
    expect(request).toHaveBeenCalledTimes(2);
    const signal = request.mock.calls[1][1].signal as AbortSignal;
    await act(async () => jest.advanceTimersByTime(30000));
    expect(request).toHaveBeenCalledTimes(2);
    const listeners = jest.mocked(AppState.addEventListener).mock.calls
      .filter(call => call[0] === 'change').map(call => call[1]);
    await act(async () => listeners.forEach(listener => listener('background')));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(respond({ ...dashboard, priorityWaiting: 99 })));
    expect(texts()).not.toContain(99);
    request.mockResolvedValue(respond({ ...dashboard, priorityWaiting: 7 }));
    await act(async () => listeners.forEach(listener => listener('active')));
    expect(texts()).toContain(7);
    expect(request).toHaveBeenCalledTimes(3);
    await act(async () => listeners.forEach(listener => listener('active')));
    expect(request).toHaveBeenCalledTimes(3);
  } finally {
    if (renderer) await act(async () => renderer!.unmount()); renderer = undefined;
    jest.useRealTimers();
  }
});

test.each([undefined, -1, 1.5, '27', NaN])('malformed KPI %s is an error rather than a fabricated zero', value => {
  expect(() => parseDashboard({ ...dashboard, sessionsToday: value })).toThrow();
});
test('missing nowServing is rejected; Colombo greeting respects midnight and noon', () => {
  expect(() => parseDashboard({ ...dashboard, nowServing: undefined })).toThrow();
  expect(greeting(new Date('2026-10-05T18:30:00Z'))).toBe('Good morning,');
  expect(greeting(new Date('2026-10-06T06:30:00Z'))).toBe('Good afternoon,');
});
test('renders actual KPIs, today sessions, notification count and priority badge/action', async () => {
  await mount();
  for (const value of ['Sessions today', 'Priority waiting', 27, 4, 'General OPD', 'Running', 'Hospital One', 'Review 4 priority requests']) expect(texts()).toContain(value);
  for (const value of ['Patients checked in', 'Now serving', 31, 'A-029']) expect(texts()).not.toContain(value);
  expect(renderer!.root.findAll(node => node.props.accessibilityLabel === 'Notifications, 2 unread').length).toBeGreaterThan(0);
  const tabBar = renderer!.root.findAll(node => node.props.descriptors && node.props.state?.type === 'tab')[0];
  expect(Object.values(tabBar.props.descriptors).some((descriptor: any) => descriptor.options.tabBarBadge === 4)).toBe(true);
});
test('legitimate zero KPIs and empty session list display without an error', async () => {
  request.mockResolvedValue(respond({ ...dashboard, sessionsToday: 0, priorityWaiting: 0, patientsCheckedIn: 0, nowServing: null, sessions: [] }));
  await mount();
  expect(texts().filter(value => value === 0)).toHaveLength(2);
  expect(texts()).toContain('No OPD sessions are scheduled for today.');
  expect(texts()).toContain('View priority requests');
});
test('loading has visible text and never displays successful KPI placeholders', async () => {
  let finish!: (value: ReturnType<typeof respond>) => void;
  request.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mount();
  expect(texts()).toContain('Loading dashboard…');
  expect(texts()).not.toContain('Sessions today');
  await act(async () => finish(respond()));
});
test('network error offers retry and obtains real data after recovery', async () => {
  request.mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect(texts()).toContain('Try again');
  expect(texts()).not.toContain('Sessions today');
  await press('Try again');
  expect(texts()).toContain(27);
  expect(request).toHaveBeenCalledTimes(2);
});
test('manual refresh failure shows an error; retry obtains new server values', async () => {
  await mount();
  request.mockRejectedValueOnce(new Error('offline'));
  await refresh();
  expect(texts()).toContain('Try again');
  expect(texts()).not.toContain('Sessions today');
  request.mockResolvedValue(respond({ ...dashboard, sessionsToday: 28 }));
  await press('Try again');
  expect(texts()).toContain(28);
  expect(texts()).not.toContain('Showing last loaded dashboard data.');
});
test('existing background refresh failure labels retained data as last loaded', async () => {
  const interval = jest.spyOn(globalThis, 'setInterval');
  try {
    await mount();
    const poll = interval.mock.calls.find(call => call[1] === 10000)![0] as () => void;
    request.mockRejectedValueOnce(new Error('offline'));
    await act(async () => poll());
    expect(texts()).toContain(27);
    expect(texts()).toContain('Showing last loaded dashboard data.');
    request.mockResolvedValue(respond({ ...dashboard, sessionsToday: 28 }));
    await act(async () => poll());
    expect(texts()).toContain(28);
    expect(texts()).not.toContain('Showing last loaded dashboard data.');
  } finally { interval.mockRestore(); }
});
test('server authorization failure invokes existing session-expired handling', async () => {
  request.mockResolvedValue({ ok: false, status: 401, json: async () => ({ success: false, error: { message: 'Please sign in again.' } }) });
  await mount();
  expect(expired).toHaveBeenCalledTimes(1);
  expect(texts()).not.toContain('Sessions today');
});
test.each([
  ["View today's OPD sessions", 'SessionsList'], ['Review priority requests', 'PriorityRequests'],
  ['Notifications, 2 unread', 'StaffNotifications'], ['Open profile', 'Profile'],
])('%s uses the existing %s route', async (label, route) => {
  await mount();
  await press(label);
  expect(ref.getCurrentRoute()?.name).toBe(route);
});


test('today sessions KPI is accessible, pressable, and targets existing SessionsList', async () => {
  await mount();
  const controls = renderer!.root.findAll(node => node.props.accessibilityLabel === "View today's OPD sessions" && typeof node.props.onPress === 'function');
  expect(controls.length).toBeGreaterThan(1);
  expect(controls[0].props.accessibilityState.disabled).toBe(false);
  await act(async () => controls[0].props.onPress());
  expect(ref.getCurrentRoute()?.name).toBe('SessionsList');
});

test('dashboard session cards pass their exact ID and View all clears targeted navigation', async () => {
  const secondId = 'b'.repeat(24);
  request.mockResolvedValue(respond({ ...dashboard, sessions: [dashboard.sessions[0],
    { ...dashboard.sessions[0], _id: secondId }] }));
  await mount();
  const cards = renderer!.root.findAll(node => node.props.accessibilityRole === 'button' &&
    node.props.accessibilityLabel?.startsWith('Open General OPD session at') && typeof node.props.onPress === 'function');
  expect(cards.length).toBeGreaterThanOrEqual(2);
  await act(async () => cards.at(-1)!.props.onPress());
  expect(ref.getCurrentRoute()?.name).toBe('SessionsList');
  expect(ref.getCurrentRoute()?.params).toMatchObject({ targetSessionId: secondId });
  await act(async () => ref.navigate('Dashboard'));
  await press("View today's OPD sessions");
  expect(ref.getCurrentRoute()?.name).toBe('SessionsList');
  expect(ref.getCurrentRoute()?.params).toMatchObject({ targetSessionId: undefined, savedSessionDate: undefined });
});


test.each([
  ['2026-10-06T02:30:00Z', 'Good morning, Reception Staff'],
  ['2026-10-06T07:30:00Z', 'Good afternoon, Reception Staff'],
  ['2026-10-06T13:30:00Z', 'Good evening, Reception Staff'],
])('greeting at %s uses Colombo time and real server name', async (now, expected) => {
  jest.useFakeTimers({ now: new Date(now) });
  try { await mount(); expect(texts()).toContain(expected); }
  finally { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; jest.useRealTimers(); }
});

test('greeting switches at 18:00 and refreshes on foreground', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-06T12:29:59Z') });
  const listener = jest.spyOn(AppState, 'addEventListener');
  try {
    await mount(); expect(texts()).toContain('Good afternoon, Reception Staff');
    await act(async () => jest.advanceTimersByTime(1000)); expect(texts()).toContain('Good evening, Reception Staff');
    const change = listener.mock.calls.find(call => call[0] === 'change')![1];
    await act(async () => change('background'));
    jest.setSystemTime(new Date('2026-10-07T02:30:00Z'));
    await act(async () => change('active')); expect(texts()).toContain('Good morning, Reception Staff');
  } finally { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; listener.mockRestore(); jest.useRealTimers(); }
});

test('missing name while loading has no comma, fake name, undefined or null', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-06T02:30:00Z') });
  request.mockImplementation(() => new Promise(() => {}));
  try { await mount(); expect(texts()).toContain('Good morning'); expect(texts()).not.toContain('Good morning,'); }
  finally { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; jest.useRealTimers(); }
});


test('authenticated full name is used while loading and focus recalculates current greeting', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-06T02:30:00Z') });
  request.mockImplementation(() => new Promise(() => {}));
  try {
    await mount({ fullName: 'Actual Authenticated Staff', staffId: 'R-02', hospital: 'Hospital One' });
    expect(texts()).toContain('Good morning, Actual Authenticated Staff');
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => ref.navigate('Priority'));
    jest.setSystemTime(new Date('2026-10-06T13:30:00Z'));
    await act(async () => ref.navigate('Dashboard'));
    expect(texts()).toContain('Good evening, Actual Authenticated Staff');
  } finally { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; jest.useRealTimers(); }
});
