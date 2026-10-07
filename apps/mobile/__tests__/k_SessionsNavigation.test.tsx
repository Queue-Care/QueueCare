import React from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Alert, Platform, TextInput } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import Renderer, { act } from 'react-test-renderer';
import { StaffNavigator } from '../src/navigation/StaffNavigator';
import type { StaffTabParams } from '../src/navigation/types';
import { fetchStaffSession, fetchStaffSessions, saveStaffSession } from '../src/features/sessions/k_staffSessions';
import { getHospitalServices } from '../src/features/hospitals/hospitalDetails';

jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/screens/ProfileScreen', () => ({ ProfileScreen: () => null }));
jest.mock('../src/screens/NotificationsScreen', () => ({ NotificationsScreen: () => null }));
jest.mock('../src/screens/PriorityRequestsScreen', () => ({ PriorityRequestsScreen: () => null }));
jest.mock('../src/screens/PriorityRequestDetailsScreen', () => ({ PriorityRequestDetailsScreen: () => null }));
jest.mock('../src/screens/ReceptionDeskScreen', () => ({ ReceptionDeskScreen: () => null }));
jest.mock('../src/theme/homeFonts', () => ({ useHomeFonts: () => ({ body: 'System', display: 'Georgia', semibold: 'System' }) }));
jest.mock('../src/features/sessions/k_staffSessions', () => ({
  ...jest.requireActual('../src/features/sessions/k_staffSessions'),
  fetchStaffSessions: jest.fn(), fetchStaffSession: jest.fn(), saveStaffSession: jest.fn(),
}));
jest.mock('../src/features/hospitals/hospitalDetails', () => ({
  ...jest.requireActual('../src/features/hospitals/hospitalDetails'), getHospitalServices: jest.fn(),
}));
test('Sessions receives the staff token and Add/Edit handoffs use the existing route', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons?.[0].onPress?.());
  jest.useFakeTimers({ now: new Date('2026-10-06T02:00:00Z'), advanceTimers: true });
  const session = { _id: '000000000000000000000101', hospitalId: '000000000000000000000001',
    serviceId: '000000000000000000000011', serviceName: 'General OPD', doctorOrTeam: 'Team',
    sessionDate: '2026-10-06', startTime: '08:30', endTime: '12:30', capacity: 50,
    bookedCount: 4, status: 'OPEN' as const };
  jest.mocked(fetchStaffSessions).mockResolvedValue({ data: [session], hasMore: false, hospitalId: '000000000000000000000001' });
  jest.mocked(fetchStaffSession).mockResolvedValue(session);
  jest.mocked(saveStaffSession).mockResolvedValue(session);
  jest.mocked(getHospitalServices).mockResolvedValue([{ id: session.serviceId, hospitalId: session.hospitalId, name: 'General OPD' }]);
  const ref = createNavigationContainerRef<StaffTabParams>();
  let renderer!: Renderer.ReactTestRenderer;
  const press = async (label: string) => {
    const button = renderer.root.findAll(node => node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function').pop()!;
    await act(async () => button.props.onPress());
  };
  try {
    await act(async () => { renderer = Renderer.create(<NavigationContainer ref={ref}>
      <StaffNavigator accessToken="staff-token" />
    </NavigationContainer>); });
    await act(async () => ref.navigate('Sessions'));
    expect(ref.getCurrentRoute()?.name).toBe('SessionsList');
    expect(fetchStaffSessions).toHaveBeenCalledWith('staff-token', 'today', 1, expect.any(AbortSignal));
    await press('Add a session');
    expect(ref.getCurrentRoute()?.name).toBe('AddEditSession');
    expect(ref.getCurrentRoute()?.params).toBeUndefined();
    await press('Select OPD service'); await press('General OPD');
    for (const [label, value] of [['Select session date', '2026-10-06T12:00:00+05:30'], ['Select session start time', '2026-10-06T08:30:00+05:30'], ['Select session end time', '2026-10-06T12:30:00+05:30']]) {
      await press(label);
      await act(async () => renderer.root.findByType(DateTimePicker).props.onValueChange({}, new Date(value)));
    }
    for (const [label, value] of [['Patient capacity', '50'], ['Doctor or clinic team', 'Team']]) {
      await act(async () => renderer.root.findAllByType(TextInput).find(node =>
        node.props.accessibilityLabel === label)!.props.onChangeText(value));
    }
    await press('Save session');
    expect(ref.getCurrentRoute()?.name).toBe('SessionsList');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(ref.getCurrentRoute()?.params).toMatchObject({ saveMessage: undefined });
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Session created').length).toBeGreaterThan(0);
    await act(async () => jest.advanceTimersByTime(2500));
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Session created')).toHaveLength(0);
    await act(async () => ref.navigate('Dashboard'));
    await act(async () => ref.navigate('Sessions'));
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Session created')).toHaveLength(0);
    expect(ref.getCurrentRoute()?.params).toMatchObject({ savedSessionDate: session.sessionDate, saveRevision: expect.any(Number) });
    expect(fetchStaffSessions).toHaveBeenLastCalledWith('staff-token', 'today', 1, expect.any(AbortSignal), session.sessionDate);
    await press('Edit session');
    expect(ref.getCurrentRoute()?.name).toBe('AddEditSession');
    expect(ref.getCurrentRoute()?.params).toEqual({ sessionId: session._id });
    await press('Save changes');
    expect(ref.getCurrentRoute()?.name).toBe('SessionsList');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Session updated').length).toBeGreaterThan(0);
    await act(async () => jest.advanceTimersByTime(2500));
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Session updated')).toHaveLength(0);
    expect(ref.getCurrentRoute()?.params).toMatchObject({ savedSessionDate: session.sessionDate, saveRevision: expect.any(Number) });
  } finally { if (renderer) await act(async () => renderer.unmount()); jest.useRealTimers(); jest.restoreAllMocks(); }
});
