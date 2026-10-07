import React from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Alert, Platform, Text, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { AddEditSessionScreen } from '../src/screens/k_AddEditSessionScreen';
import { fetchStaffSession, fetchStaffSessions, saveStaffSession, type StaffOpdSession } from '../src/features/sessions/k_staffSessions';
import { getHospitalServices } from '../src/features/hospitals/hospitalDetails';
import { ApiError, apiRequest } from '../src/api/g_apiClient';
import { emptySessionForm, validateSessionForm } from '../src/features/sessions/k_sessionForm';

jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/theme/homeFonts', () => ({ useHomeFonts: () => ({ body: 'System', display: 'Georgia', semibold: 'System' }) }));
jest.mock('../src/features/sessions/k_staffSessions', () => ({
  ...jest.requireActual('../src/features/sessions/k_staffSessions'),
  fetchStaffSessions: jest.fn(), fetchStaffSession: jest.fn(), saveStaffSession: jest.fn(),
}));
jest.mock('../src/features/hospitals/hospitalDetails', () => ({
  ...jest.requireActual('../src/features/hospitals/hospitalDetails'), getHospitalServices: jest.fn(),
}));
const list = jest.mocked(fetchStaffSessions), detail = jest.mocked(fetchStaffSession), save = jest.mocked(saveStaffSession);
const services = jest.mocked(getHospitalServices);
const session: StaffOpdSession = { _id: '000000000000000000000101', hospitalId: '000000000000000000000001',
  serviceId: '000000000000000000000011', serviceName: 'General OPD', doctorOrTeam: 'OPD team',
  sessionDate: '2026-10-06', startTime: '08:30', endTime: '12:30', capacity: 50, bookedCount: 4, status: 'OPEN' };
let renderer: Renderer.ReactTestRenderer;
const saved = jest.fn(), cancel = jest.fn(), expired = jest.fn();
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-06T02:00:00Z') });
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.[0].onPress?.(); });
  list.mockResolvedValue({ data: [], hasMore: false, hospitalId: session.hospitalId });
  detail.mockResolvedValue(session);
  services.mockResolvedValue([{ id: session.serviceId!, hospitalId: session.hospitalId, name: 'General OPD' }]);
  save.mockResolvedValue(session);
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.useRealTimers(); jest.restoreAllMocks(); });
async function mount(sessionId?: string) {
  await act(async () => { renderer = Renderer.create(<AddEditSessionScreen accessToken="staff-token" sessionId={sessionId}
    onSaved={saved} onCancel={cancel} onSessionExpired={expired} />); });
}
function button(label: string) {
  return renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').pop()!;
}
async function press(label: string) { await act(async () => button(label).props.onPress()); }
function input(label: string) { return renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!; }
async function change(label: string, value: string) {
  const control: Record<string, string> = { Date: 'Select session date', 'Start time': 'Select session start time', 'End time': 'Select session end time' };
  if (control[label]) {
    await press(control[label]);
    await act(async () => renderer.root.findByType(DateTimePicker).props.onValueChange({}, new Date(label === 'Date' ? `${value}T12:00:00+05:30` : `2026-10-06T${value}:00+05:30`)));
  } else await act(async () => input(label).props.onChangeText(value));
}
async function chooseService() { await press('Select OPD service'); await press('General OPD'); }
function text(value: string) { return renderer.root.findAllByType(Text).some(node => node.props.children === value); }
async function fill() {
  await chooseService();
  for (const [label, value] of [['Date', '2026-10-06'], ['Start time', '08:30'], ['End time', '12:30'],
    ['Patient capacity', '50'], ['Doctor or clinic team', '  OPD team  ']]) await change(label, value);
}
test('empty-hospital create mode loads real services from authenticated metadata and renders fields', async () => {
  await mount();
  expect(list).toHaveBeenCalledWith('staff-token', 'today', 1, expect.any(AbortSignal));
  expect(services).toHaveBeenCalledWith(session.hospitalId, expect.any(AbortSignal));
  expect(detail).not.toHaveBeenCalled();
  for (const label of ['Patient capacity', 'Doctor or clinic team']) expect(input(label).props.value).toBe('');
  expect(button('Select session date').props.accessibilityValue.text).toBe('Select date');
  expect(text('OPD service')).toBe(true);
  await press('Cancel'); expect(cancel).toHaveBeenCalledTimes(1);
});
test('edit mode prefills only editable values from the real session detail', async () => {
  await mount(session._id);
  expect(detail).toHaveBeenCalledWith('staff-token', session._id, expect.any(AbortSignal));
  expect(button('Select session date').props.accessibilityValue.text).toBe('Tuesday, 6 October 2026');
  expect(button('Select session start time').props.accessibilityValue.text).toBe('08:30 AM');
  expect(button('Select session end time').props.accessibilityValue.text).toBe('12:30 PM');
  expect(input('Patient capacity').props.value).toBe('50');
  expect(input('Doctor or clinic team').props.value).toBe('OPD team');
  expect(text('General OPD')).toBe(true);
});
test('required fields, invalid times, invalid dates and invalid capacity block requests', async () => {
  await mount(); await press('Save session');
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  expect(text('Check the highlighted session details.')).toBe(true); expect(save).not.toHaveBeenCalled();
  await fill();
  await change('End time', '08:00'); await press('Save session');
  expect(text('End time must be after start time on the same day.')).toBe(true);
  await change('End time', '12:30'); await change('Patient capacity', '1.5'); await press('Save session');
  expect(text('Enter a positive whole-number capacity.')).toBe(true); expect(save).not.toHaveBeenCalled();
});

test('missing service rejects saving; choosing an active service makes the form valid', async () => {
  await mount();
  for (const [label, value] of [['Date', '2026-10-06'], ['Start time', '08:30'], ['End time', '12:30'],
    ['Patient capacity', '50'], ['Doctor or clinic team', 'Team']]) await change(label, value);
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  await press('Save session'); expect(save).not.toHaveBeenCalled(); expect(text('Select an OPD service.')).toBe(true);
  await chooseService(); expect(button('Save session').props.accessibilityState.disabled).toBe(false);
});

test('create rejects past or current start in Colombo while allowing a future start', async () => {
  await mount(); await fill();
  await change('Start time', '07:00'); expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  expect(text('Start time must be in the future.')).toBe(true);
  await change('Date', '2026-10-06'); await change('Start time', '07:30');
  expect(button('Save session').props.accessibilityState.disabled).toBe(false); // exactly now
  await change('Start time', '07:31'); expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  expect(text('Start time must be in the future.')).toBe(false);
});

test('edit enforces loaded booked count independently of status before scheduled end', async () => {
  detail.mockResolvedValueOnce({ ...session, status: 'COMPLETED' });
  await mount(session._id); expect(button('Save changes').props.accessibilityState.disabled).toBe(false);
  await change('Patient capacity', '3'); expect(button('Save changes').props.accessibilityState.disabled).toBe(false);
  expect(text('Capacity must not be below the existing booked count.')).toBe(true);
  await press('Save changes'); expect(save).not.toHaveBeenCalled();
  await change('Patient capacity', '4'); expect(button('Save changes').props.accessibilityState.disabled).toBe(false);
  expect(text('Capacity must not be below the existing booked count.')).toBe(false);
});

test('time relationship errors recompute when either field changes without another submit', async () => {
  await mount(); await fill(); await change('End time', '08:30');
  expect(text('End time must be after start time on the same day.')).toBe(true);
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  await change('Start time', '08:00');
  expect(text('End time must be after start time on the same day.')).toBe(false);
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  await change('Start time', '09:00'); expect(text('End time must be after start time on the same day.')).toBe(true);
  await change('End time', '10:00'); expect(text('End time must be after start time on the same day.')).toBe(false);
  expect(save).not.toHaveBeenCalled();
});
test('create submits only six normalized fields and navigates on confirmed success', async () => {
  await mount(); await fill(); await press('Save session');
  expect(save).toHaveBeenCalledWith('staff-token', { serviceId: session.serviceId, sessionDate: session.sessionDate,
    startTime: '08:30', endTime: '12:30', capacity: 50, doctorOrTeam: 'OPD team' }, undefined, expect.any(AbortSignal));
  expect(saved).toHaveBeenCalledWith(session);
});
test('edit submits the correct session ID and does not submit server-owned fields', async () => {
  await mount(session._id); await change('Doctor or clinic team', 'New team'); await press('Save changes');
  expect(save.mock.calls[0][2]).toBe(session._id);
  expect(Object.keys(save.mock.calls[0][1]).sort()).toEqual(['capacity', 'doctorOrTeam', 'endTime', 'serviceId', 'sessionDate', 'startTime']);
  expect(save.mock.calls[0][1].doctorOrTeam).toBe('New team'); expect(saved).toHaveBeenCalledWith(session);
});
test('duplicate submissions are prevented synchronously while saving', async () => {
  let resolve!: (value: StaffOpdSession) => void;
  save.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); await fill();
  const submit = button('Save session').props.onPress;
  await act(async () => { submit(); submit(); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(button('Select session date').props.accessibilityState.disabled).toBe(true);
  expect(button('Cancel').props.accessibilityState.disabled).toBe(true);
  await act(async () => resolve(session)); expect(saved).toHaveBeenCalledTimes(1);
});
test('backend field errors remain visible without navigating or faking success', async () => {
  save.mockRejectedValueOnce(new ApiError('Check the session details.', 400, 'VALIDATION_ERROR',
    { capacity: 'Capacity must not be below existing bookings.' }));
  await mount(session._id); await press('Save changes');
  expect(text('Check the session details.')).toBe(true);
  expect(text('Capacity must not be below existing bookings.')).toBe(true);
  expect(input('Patient capacity').props.value).toBe('50'); expect(input('Doctor or clinic team').props.value).toBe('OPD team');
  expect(saved).not.toHaveBeenCalled();
});
test('loading failures retry, empty services reject save and unauthorized errors use existing callback', async () => {
  list.mockRejectedValueOnce(new ApiError('Sign in again.', 401));
  await mount(); expect(text('Sign in again.')).toBe(true); expect(expired).toHaveBeenCalledTimes(1);
  services.mockResolvedValue([]); await press('Try again');
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  expect(text('No active services are available. Ask your hospital administrator to set up a service.')).toBe(true);
});
test('client validation rejects unsafe capacities and malformed times', () => {
  const valid = { ...emptySessionForm, serviceId: session.serviceId!, sessionDate: session.sessionDate,
    startTime: '08:30', endTime: '12:30', capacity: '50', doctorOrTeam: 'Team' };
  expect(validateSessionForm(valid)).toEqual({});
  for (const capacity of ['0', '-1', '1.5', '9007199254740992', '1e2']) expect(validateSessionForm({ ...valid, capacity }).capacity).toBeTruthy();
  for (const startTime of ['8:30', '24:00', '08:60']) expect(validateSessionForm({ ...valid, startTime }).startTime).toBeTruthy();
  for (const sessionDate of ['2026-02-29', '2026-13-01', '06/10/2026']) expect(validateSessionForm({ ...valid, sessionDate }).sessionDate).toBeTruthy();
  for (const capacity of ['', '0', '-1', '1.5', '1e2', '9007199254740992']) expect(validateSessionForm({ ...valid, capacity }).capacity).toBeTruthy();
  expect(validateSessionForm({ ...valid, serviceId: 'invalid' }).serviceId).toBeTruthy();
  expect(validateSessionForm(valid, { serviceIds: [] }).serviceId).toBeTruthy();
  expect(validateSessionForm({ ...valid, doctorOrTeam: '123' })).toEqual({});
});

test('create future validation respects the Colombo day boundary, not the device or UTC date', () => {
  const form = { ...emptySessionForm, serviceId: session.serviceId!, sessionDate: '2026-10-06',
    startTime: '00:00', endTime: '01:00', capacity: '1', doctorOrTeam: 'Team' };
  expect(validateSessionForm(form, { mode: 'create', now: new Date('2026-10-05T18:29:59Z') })).toEqual({});
  expect(validateSessionForm(form, { mode: 'create', now: new Date('2026-10-05T18:30:00Z') }).startTime).toBeTruthy();
  expect(validateSessionForm(form, { mode: 'edit', now: new Date('2026-10-07T00:00:00Z') })).toEqual({});
});


test('create date minimum uses Colombo calendar day, rejects past selections and cancellation preserves value', async () => {
  jest.setSystemTime(new Date('2026-10-05T18:31:00Z'));
  await mount(); await change('Date', '2026-10-06'); await press('Select session date');
  const picker = renderer.root.findByType(DateTimePicker);
  expect(picker.props.mode).toBe('date'); expect(picker.props.timeZoneName).toBe('Asia/Colombo');
  expect(picker.props.minimumDate.toISOString()).toBe('2026-10-05T18:30:00.000Z');
  await act(async () => picker.props.onValueChange({}, new Date('2026-10-05T12:00:00+05:30')));
  await press('Select session date');
  await act(async () => renderer.root.findByType(DateTimePicker).props.onDismiss());
  expect(text('Tuesday, 6 October 2026')).toBe(true); expect(save).not.toHaveBeenCalled();
});

test('edit permits past date and time dialogs cancel without changing values', async () => {
  await mount(session._id); await press('Select session date');
  expect(renderer.root.findByType(DateTimePicker).props.minimumDate).toBeUndefined();
  await act(async () => renderer.root.findByType(DateTimePicker).props.onDismiss());
  await change('Date', '2026-09-24'); expect(text('Thursday, 24 September 2026')).toBe(true);
  for (const label of ['Select session start time', 'Select session end time']) {
    const previous = button(label).props.accessibilityValue.text; await press(label);
    expect(renderer.root.findByType(DateTimePicker).props.mode).toBe('time');
    await act(async () => renderer.root.findByType(DateTimePicker).props.onDismiss());
    expect(button(label).props.accessibilityValue.text).toBe(previous);
  }
  await press('Save changes'); expect(save.mock.calls[0][1].sessionDate).toBe('2026-09-24');
});

test('iOS draft values require confirmation; cancellation preserves date and time', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios'); await mount(session._id);
  for (const label of ['Select session date', 'Select session start time']) {
    const previous = button(label).props.accessibilityValue.text; await press(label);
    await act(async () => renderer.root.findByType(DateTimePicker).props.onValueChange({}, new Date('2026-10-07T09:15:00+05:30')));
    expect(button(label).props.accessibilityValue.text).toBe(previous);
    await press('Cancel picker'); expect(button(label).props.accessibilityValue.text).toBe(previous);
  }
  await press('Select session end time');
  await act(async () => renderer.root.findByType(DateTimePicker).props.onValueChange({}, new Date('2026-10-06T13:05:00+05:30')));
  await press('Use time'); expect(text('01:05 PM')).toBe(true);
  await press('Select session date');
  await act(async () => renderer.root.findByType(DateTimePicker).props.onValueChange({}, new Date('2026-10-07T12:00:00+05:30')));
  await press('Use date'); await press('Save changes');
  expect(save.mock.calls[0][1]).toMatchObject({ sessionDate: '2026-10-07', endTime: '13:05' });
});

test.each(['', '0', '-1', '1.5', 'letters', '9007199254740992'])('capacity %s blocks Save', async capacity => {
  await mount(); await fill(); await change('Patient capacity', capacity);
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  if (capacity === '0' || capacity === '-1') expect(text('Capacity must be at least 1.')).toBe(true);
  await press('Save session'); expect(save).not.toHaveBeenCalled();
});

test('capacity one valid, blank doctor invalid, and future date permits earlier time', async () => {
  await mount(); await fill(); await change('Patient capacity', '1');
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  await change('Doctor or clinic team', '  '); expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  await change('Doctor or clinic team', 'Team'); await change('Date', '2026-10-07'); await change('Start time', '01:00');
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  await press('Save session'); expect(save.mock.calls[0][1]).toMatchObject({ sessionDate: '2026-10-07', startTime: '01:00', capacity: 1 });
});


test.each([undefined, session._id])('confirmed success %s navigates without any blocking alert', async sessionId => {
  await mount(sessionId); if (!sessionId) await fill();
  await press(sessionId ? 'Save changes' : 'Save session');
  expect(saved).toHaveBeenCalledTimes(1); expect(saved).toHaveBeenCalledWith(session);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test.each([undefined, session._id])('network failure %s shows connection popup and preserves entered values', async sessionId => {
  save.mockRejectedValueOnce(new ApiError('Could not connect.', 0, 'NETWORK_ERROR'));
  await mount(sessionId); if (!sessionId) await fill(); await press(sessionId ? 'Save changes' : 'Save session');
  expect(text('Check your connection and try again.')).toBe(true);
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Connection problem. Check your connection and try again.').length).toBeGreaterThan(0);
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(2500));
  expect(text('Check your connection and try again.')).toBe(false);
  expect(input('Patient capacity').props.value).toBe('50'); expect(saved).not.toHaveBeenCalled();
});

test('field validation and ordinary business errors never produce connection popups', async () => {
  await mount(); await press('Save session'); expect(Alert.alert).not.toHaveBeenCalled();
  await fill(); save.mockRejectedValueOnce(new ApiError('Session conflict.', 409, 'CONFLICT', { startTime: 'Choose another start.' }));
  await press('Save session'); expect(text('Choose another start.')).toBe(true);
  expect(Alert.alert).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
});

test('loading network failure shows popup but malformed response stays inline', async () => {
  list.mockRejectedValueOnce(new ApiError('Could not connect.', 0, 'NETWORK_ERROR')); await mount();
  expect(text('Check your connection and try again.')).toBe(true);
  await act(async () => jest.advanceTimersByTime(2500));
  list.mockRejectedValueOnce(new ApiError('We could not read the server response. Please try again.'));
  await press('Try again'); expect(Alert.alert).not.toHaveBeenCalled(); expect(text('Check your connection and try again.')).toBe(false);
});


test('rapid failed submits produce one non-blocking toast and allow retry', async () => {
  let reject!: (reason: ApiError) => void;
  save.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await mount(); await fill(); const submit = button('Save session').props.onPress;
  await act(async () => { submit(); submit(); });
  await act(async () => reject(new ApiError('Could not connect.', 0, 'NETWORK_ERROR')));
  expect(save).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(Text).filter(node => node.props.children === 'Check your connection and try again.')).toHaveLength(1);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
});

test('shared client distinguishes transport failure from malformed response', async () => {
  const previousFetch = globalThis.fetch, previousUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.test/api/v1';
  const fetch = jest.fn(); globalThis.fetch = fetch;
  try {
    fetch.mockRejectedValueOnce(new TypeError('offline'));
    await expect(apiRequest('/staff/sessions', { token: 'staff-token' })).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
    fetch.mockResolvedValueOnce({ json: async () => { throw new SyntaxError('bad JSON'); } });
    await expect(apiRequest('/staff/sessions', { token: 'staff-token' })).rejects.toMatchObject({ code: '', message: 'We could not read the server response. Please try again.' });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = previousUrl;
  }
});


test('direct navigation to ended Edit cannot save or bypass original end by changing form date', async () => {
  detail.mockResolvedValueOnce({ ...session, sessionDate: '2026-10-05' });
  await mount(session._id);
  expect(text('This session has ended and can no longer be edited.')).toBe(true);
  expect(button('Save changes').props.accessibilityState.disabled).toBe(true);
  await change('Date', '2026-10-07'); await press('Save changes');
  expect(save).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
});

test('running Edit stays usable through exact end then disables automatically and guards stale submit', async () => {
  jest.setSystemTime(new Date('2026-10-06T06:59:59.999Z')); await mount(session._id);
  expect(button('Save changes').props.accessibilityState.disabled).toBe(false);
  await act(async () => jest.advanceTimersByTime(1));
  expect(button('Save changes').props.accessibilityState.disabled).toBe(false);
  const staleSubmit = button('Save changes').props.onPress;
  jest.setSystemTime(new Date('2026-10-06T07:00:00.001Z'));
  await act(async () => staleSubmit());
  expect(save).not.toHaveBeenCalled(); expect(text('This session has ended and can no longer be edited.')).toBe(true);
  await act(async () => jest.advanceTimersByTime(1));
  expect(button('Save changes').props.accessibilityState.disabled).toBe(true);
});


test('empty Add form shows all six required errors only after Save and makes no create call', async () => {
  await mount();
  const required = ['Select an OPD service.', 'Select a date.', 'Select a start time.', 'Select an end time.', 'Enter patient capacity.', 'Enter a doctor or clinic team.'];
  expect(button('Save session').props.accessibilityState.disabled).toBe(false);
  for (const message of required) expect(text(message)).toBe(false);
  await press('Save session'); for (const message of required) expect(text(message)).toBe(true);
  expect(save).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
  await fill(); for (const message of required) expect(text(message)).toBe(false);
  await press('Save session'); expect(save).toHaveBeenCalledTimes(1);
});

test.each(['', '   '])('Add doctor/team %s is required and never submitted', async doctor => {
  await mount(); await fill(); await change('Doctor or clinic team', doctor); await press('Save session');
  expect(text('Enter a doctor or clinic team.')).toBe(true);
  expect(save).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
});

test.each([
  ['serviceId', null, 'Select an OPD service.'],
  ['sessionDate', '', 'Select a date.'],
  ['startTime', null, 'Select a start time.'],
  ['endTime', null, 'Select an end time.'],
  ['capacity', null, 'Enter patient capacity.'],
  ['doctorOrTeam', '  ', 'Enter a doctor or clinic team.'],
])('Edit missing %s renders inline required feedback and never updates', async (field, value, message) => {
  detail.mockResolvedValueOnce({ ...session, [field as string]: value });
  await mount(session._id); expect(button('Save changes').props.accessibilityState.disabled).toBe(false);
  await press('Save changes'); expect(text(message as string)).toBe(true);
  expect(save).not.toHaveBeenCalled(); expect(Alert.alert).not.toHaveBeenCalled();
});

test('clearing Edit capacity and doctor/team blocks update until corrected', async () => {
  await mount(session._id); await change('Patient capacity', ''); await change('Doctor or clinic team', '');
  await press('Save changes'); expect(save).not.toHaveBeenCalled();
  expect(text('Enter patient capacity.')).toBe(true); expect(text('Enter a doctor or clinic team.')).toBe(true);
  await change('Patient capacity', '50'); await change('Doctor or clinic team', '  New team  ');
  expect(text('Enter patient capacity.')).toBe(false); expect(text('Enter a doctor or clinic team.')).toBe(false);
  await press('Save changes'); expect(save.mock.calls[0][1].doctorOrTeam).toBe('New team');
});
