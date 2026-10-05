import React from 'react';
import { Text, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { AddEditSessionScreen } from '../src/screens/k_AddEditSessionScreen';
import { fetchStaffSession, fetchStaffSessions, saveStaffSession, type StaffOpdSession } from '../src/features/sessions/k_staffSessions';
import { getHospitalServices } from '../src/features/hospitals/hospitalDetails';
import { ApiError } from '../src/api/g_apiClient';
import { emptySessionForm, validateSessionForm } from '../src/features/sessions/k_sessionForm';

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
  jest.clearAllMocks();
  list.mockResolvedValue({ data: [], hasMore: false, hospitalId: session.hospitalId });
  detail.mockResolvedValue(session);
  services.mockResolvedValue([{ id: session.serviceId!, hospitalId: session.hospitalId, name: 'General OPD' }]);
  save.mockResolvedValue(session);
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
async function mount(sessionId?: string) {
  await act(async () => { renderer = Renderer.create(<AddEditSessionScreen accessToken="staff-token" sessionId={sessionId}
    onSaved={saved} onCancel={cancel} onSessionExpired={expired} />); });
}
function button(label: string) {
  return renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').pop()!;
}
async function press(label: string) { await act(async () => button(label).props.onPress()); }
function input(label: string) { return renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!; }
async function change(label: string, value: string) { await act(async () => input(label).props.onChangeText(value)); }
function text(value: string) { return renderer.root.findAllByType(Text).some(node => node.props.children === value); }
async function fill() {
  await press('General OPD');
  for (const [label, value] of [['Date', '2026-10-06'], ['Start time', '08:30'], ['End time', '12:30'],
    ['Capacity', '50'], ['Doctor/Team', '  OPD team  ']]) await change(label, value);
}
test('empty-hospital create mode loads real services from authenticated metadata and renders fields', async () => {
  await mount();
  expect(list).toHaveBeenCalledWith('staff-token', 'today', 1, expect.any(AbortSignal));
  expect(services).toHaveBeenCalledWith(session.hospitalId, expect.any(AbortSignal));
  expect(detail).not.toHaveBeenCalled();
  for (const label of ['Date', 'Start time', 'End time', 'Capacity', 'Doctor/Team']) expect(input(label).props.value).toBe('');
  expect(text('Department/Service')).toBe(true);
  await press('Cancel'); expect(cancel).toHaveBeenCalledTimes(1);
});
test('edit mode prefills only editable values from the real session detail', async () => {
  await mount(session._id);
  expect(detail).toHaveBeenCalledWith('staff-token', session._id, expect.any(AbortSignal));
  expect(input('Date').props.value).toBe('2026-10-06');
  expect(input('Start time').props.value).toBe('08:30');
  expect(input('End time').props.value).toBe('12:30');
  expect(input('Capacity').props.value).toBe('50');
  expect(input('Doctor/Team').props.value).toBe('OPD team');
  expect(button('General OPD').props.accessibilityState.checked).toBe(true);
});
test('required fields, invalid times, invalid dates and invalid capacity block requests', async () => {
  await mount(); await press('Create session');
  expect(text('Check the highlighted session details.')).toBe(true); expect(save).not.toHaveBeenCalled();
  await fill();
  await change('End time', '08:00'); await press('Create session');
  expect(text('End time must be after start time on the same day.')).toBe(true);
  await change('End time', '12:30'); await change('Date', '2026-02-29'); await press('Create session');
  expect(text('Enter a real date as YYYY-MM-DD.')).toBe(true);
  await change('Date', '2026-10-06'); await change('Capacity', '1.5'); await press('Create session');
  expect(text('Enter a positive whole-number capacity.')).toBe(true); expect(save).not.toHaveBeenCalled();
});
test('create submits only six normalized fields and navigates on confirmed success', async () => {
  await mount(); await fill(); await press('Create session');
  expect(save).toHaveBeenCalledWith('staff-token', { serviceId: session.serviceId, sessionDate: session.sessionDate,
    startTime: '08:30', endTime: '12:30', capacity: 50, doctorOrTeam: 'OPD team' }, undefined, expect.any(AbortSignal));
  expect(saved).toHaveBeenCalledWith(session);
});
test('edit submits the correct session ID and does not submit server-owned fields', async () => {
  await mount(session._id); await change('Doctor/Team', 'New team'); await press('Update session');
  expect(save.mock.calls[0][2]).toBe(session._id);
  expect(Object.keys(save.mock.calls[0][1]).sort()).toEqual(['capacity', 'doctorOrTeam', 'endTime', 'serviceId', 'sessionDate', 'startTime']);
  expect(save.mock.calls[0][1].doctorOrTeam).toBe('New team'); expect(saved).toHaveBeenCalledWith(session);
});
test('duplicate submissions are prevented synchronously while saving', async () => {
  let resolve!: (value: StaffOpdSession) => void;
  save.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); await fill();
  const submit = button('Create session').props.onPress;
  await act(async () => { submit(); submit(); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(input('Date').props.editable).toBe(false);
  expect(button('Cancel').props.accessibilityState.disabled).toBe(true);
  await act(async () => resolve(session)); expect(saved).toHaveBeenCalledTimes(1);
});
test('backend field errors remain visible without navigating or faking success', async () => {
  save.mockRejectedValueOnce(new ApiError('Check the session details.', 400, 'VALIDATION_ERROR',
    { capacity: 'Capacity must not be below existing bookings.' }));
  await mount(session._id); await press('Update session');
  expect(text('Check the session details.')).toBe(true);
  expect(text('Capacity must not be below existing bookings.')).toBe(true);
  expect(saved).not.toHaveBeenCalled();
});
test('loading failures retry, empty services disable save and unauthorized errors use existing callback', async () => {
  list.mockRejectedValueOnce(new ApiError('Sign in again.', 401));
  await mount(); expect(text('Sign in again.')).toBe(true); expect(expired).toHaveBeenCalledTimes(1);
  services.mockResolvedValue([]); await press('Try again');
  expect(button('Create session').props.accessibilityState.disabled).toBe(true);
  expect(text('No active services are available. Ask your hospital administrator to set up a service.')).toBe(true);
});
test('client validation rejects unsafe capacities and malformed times', () => {
  const valid = { ...emptySessionForm, serviceId: session.serviceId!, sessionDate: session.sessionDate,
    startTime: '08:30', endTime: '12:30', capacity: '50', doctorOrTeam: 'Team' };
  expect(validateSessionForm(valid)).toEqual({});
  for (const capacity of ['0', '-1', '1.5', '9007199254740992', '1e2']) expect(validateSessionForm({ ...valid, capacity }).capacity).toBeTruthy();
  for (const startTime of ['8:30', '24:00', '08:60']) expect(validateSessionForm({ ...valid, startTime }).startTime).toBeTruthy();
});
