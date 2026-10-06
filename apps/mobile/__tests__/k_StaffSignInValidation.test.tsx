import React from 'react';
import { Alert, ScrollView, Text, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { StaffSignInScreen } from '../src/screens/StaffSignInScreen';
import { signInStaff } from '../src/features/staff/g_staffAuth';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const fetchMock = jest.fn(), authenticated = jest.fn();
let renderer: Renderer.ReactTestRenderer;
const account = { userId: '000000000000000000000001', staffId: 'RC-001', fullName: 'Test Reception',
  hospital: 'Test Hospital', role: 'RECEPTION' };
const response = () => ({ ok: true, status: 200,
  json: async () => ({ success: true, data: { user: account, accessToken: 'test-token' } }) });
async function mount() {
  await act(async () => { renderer = Renderer.create(<StaffSignInScreen navigation={{}} route={{}} onAuthenticated={authenticated} />); });
}
function input(label: string) { return renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!; }
function button(label = 'Sign in') { return renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').pop()!; }
function texts() { return renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' '); }
async function change(label: string, value: string) { await act(async () => input(label).props.onChangeText(value)); }
async function fill() { await change('Staff ID', '  rc-001  '); await change('Password', ' test password '); }
async function submit() { await act(async () => { void button().props.onPress(); }); }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  globalThis.fetch = fetchMock; fetchMock.mockReset(); fetchMock.mockResolvedValue(response());
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.0.2.1:5000/api/v1';
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  jest.restoreAllMocks(); jest.useRealTimers(); globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
});

test('empty Sign In starts enabled without errors; tapping shows both messages without a request', async () => {
  await mount();
  expect(button().props.accessibilityState.disabled).toBe(false);
  expect(texts()).not.toContain('Enter your Staff ID.'); expect(texts()).not.toContain('Enter your password.');
  await submit();
  expect(texts()).toContain('Enter your Staff ID.'); expect(texts()).toContain('Enter your password.');
  expect(button().props.accessibilityState.disabled).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
});
test('after submit, correcting fields clears errors and clearing them recomputes errors while button stays enabled', async () => {
  await mount(); await submit(); await change('Staff ID', '   '); await change('Password', 'password');
  expect(button().props.disabled).toBe(false); expect(texts()).toContain('Enter your Staff ID.');
  expect(texts()).not.toContain('Enter your password.');
  await change('Staff ID', 'RC-001'); expect(button().props.disabled).toBe(false);
  expect(texts()).not.toContain('Enter your Staff ID.');
  await change('Password', ''); expect(button().props.disabled).toBe(false); expect(texts()).toContain('Enter your password.');
  await submit(); expect(fetchMock).not.toHaveBeenCalled();
});
test('valid form authenticates, trims Staff ID, and preserves password exactly', async () => {
  await mount(); await fill(); await submit();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ staffId: 'rc-001', password: ' test password ' });
  expect(authenticated).toHaveBeenCalledTimes(1);
});
test('rapid duplicate submit sends one request and exposes busy state', async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  fetchMock.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); await fill(); const press = button().props.onPress;
  await act(async () => { press(); press(); });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(button().props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(input('Staff ID').props.editable).toBe(false);
  await act(async () => resolve(response())); expect(authenticated).toHaveBeenCalledTimes(1);
});
test('stalled fetch times out, aborts, preserves input, and allows retry', async () => {
  fetchMock.mockImplementationOnce(() => new Promise(() => {}));
  await mount(); await fill(); await submit(); const signal = fetchMock.mock.calls[0][1].signal;
  await act(async () => jest.advanceTimersByTime(15000));
  expect(signal.aborted).toBe(true); expect(button().props.accessibilityState.busy).toBe(false);
  expect(texts()).toContain('Connection problem'); expect(Alert.alert).not.toHaveBeenCalled();
  expect(input('Staff ID').props.value).toBe('  rc-001  '); expect(input('Password').props.value).toBe(' test password ');
  await submit(); expect(fetchMock).toHaveBeenCalledTimes(2); expect(authenticated).toHaveBeenCalledTimes(1);
});
test('network failure releases lock and preserves entered values', async () => {
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await mount(); await fill(); await submit();
  expect(button().props.disabled).toBe(false); expect(input('Password').props.value).toBe(' test password ');
  expect(texts()).toContain('Connection problem'); expect(Alert.alert).not.toHaveBeenCalled();
  await submit(); expect(authenticated).toHaveBeenCalledTimes(1);
});
test('backend field errors render inline and generic credentials failure remains unchanged', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ success: false,
    error: { message: 'Check the sign-in details.', fieldErrors: { password: 'Password must be 128 bytes or fewer.' } } }) });
  await mount(); await fill(); await submit(); expect(texts()).toContain('Password must be 128 bytes or fewer.');
  await change('Password', 'corrected'); expect(texts()).not.toContain('Password must be 128 bytes or fewer.');
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false,
    error: { message: 'Check your Staff ID and password, then try again.' } }) });
  await submit(); expect(texts()).toContain('Invalid Staff ID or password.'); expect(Alert.alert).not.toHaveBeenCalled();
  expect(authenticated).not.toHaveBeenCalled();
});
test('unmount cancels request and late success cannot authenticate', async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  fetchMock.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); await fill(); await submit(); const signal = fetchMock.mock.calls[0][1].signal;
  await act(async () => renderer.unmount()); expect(signal.aborted).toBe(true);
  await act(async () => resolve(response())); expect(authenticated).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
});
test('pre-cancelled sign-in does not fetch and stalled response parsing also times out', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(signInStaff('RC-001', 'password', controller.signal)).rejects.toThrow('cancelled');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) });
  const pending = expect(signInStaff('RC-001', 'password')).rejects.toThrow('too long');
  await jest.advanceTimersByTimeAsync(15000); await pending;
});


test('keyboard does not consume Sign In taps and backend response without hospitalId authenticates', async () => {
  await mount(); await fill();
  expect(renderer.root.findByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  expect(account).not.toHaveProperty('hospitalId');
  await submit();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('http://192.0.2.1:5000/api/v1/staff/auth/sign-in');
  expect(authenticated).toHaveBeenCalledWith({ userId: account.userId, accessToken: 'test-token', role: 'RECEPTION',
    staff: { fullName: account.fullName, staffId: account.staffId, hospital: account.hospital } });
  expect(Alert.alert).not.toHaveBeenCalled();
});


test('invalid credentials stay inline, preserve inputs, clear on edit, and allow immediate successful retry', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false,
    error: { code: 'INVALID_CREDENTIALS', message: 'Check your Staff ID and password, then try again.' } }) });
  await mount(); await fill(); await submit();
  expect(texts()).toContain('Invalid Staff ID or password.'); expect(texts()).not.toContain('Connection problem');
  expect(Alert.alert).not.toHaveBeenCalled(); expect(authenticated).not.toHaveBeenCalled();
  expect(input('Staff ID').props.value).toBe('  rc-001  '); expect(input('Password').props.value).toBe(' test password ');
  expect(button().props.disabled).toBe(false);
  await change('Staff ID', 'R-02'); expect(texts()).not.toContain('Invalid Staff ID or password.');
  await submit(); expect(authenticated).toHaveBeenCalledTimes(1);
});

test('backend business error stays inline and password edit clears stale message', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ success: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: 'Staff sign-in is unavailable.' } }) });
  await mount(); await fill(); await submit(); expect(texts()).toContain('Staff sign-in is unavailable.');
  expect(Alert.alert).not.toHaveBeenCalled(); expect(texts()).not.toContain('Connection problem');
  await change('Password', 'corrected'); expect(texts()).not.toContain('Staff sign-in is unavailable.');
});
