import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import Renderer, { act } from 'react-test-renderer';
import { StaffNavigator } from '../src/navigation/StaffNavigator';
import type { StaffTabParams } from '../src/navigation/types';
import { fetchStaffSession, fetchStaffSessions } from '../src/features/sessions/k_staffSessions';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/screens/ProfileScreen', () => ({ ProfileScreen: () => null }));
jest.mock('../src/screens/NotificationsScreen', () => ({ NotificationsScreen: () => null }));
jest.mock('../src/screens/PriorityRequestsScreen', () => ({ PriorityRequestsScreen: () => null }));
jest.mock('../src/screens/PriorityRequestDetailsScreen', () => ({ PriorityRequestDetailsScreen: () => null }));
jest.mock('../src/screens/ReceptionDeskScreen', () => ({ ReceptionDeskScreen: () => null }));
jest.mock('../src/theme/homeFonts', () => ({ useHomeFonts: () => ({ body: 'System', display: 'Georgia', semibold: 'System' }) }));
jest.mock('../src/features/sessions/k_staffSessions', () => ({
  ...jest.requireActual('../src/features/sessions/k_staffSessions'),
  fetchStaffSessions: jest.fn(), fetchStaffSession: jest.fn(),
}));
test('Sessions receives the staff token and Add/Edit handoffs use the existing route', async () => {
  const session = { _id: '000000000000000000000101', hospitalId: '000000000000000000000001',
    serviceId: '000000000000000000000011', serviceName: 'General OPD', doctorOrTeam: 'Team',
    sessionDate: '2026-10-06', startTime: '08:30', endTime: '12:30', capacity: 50,
    bookedCount: 4, status: 'OPEN' as const };
  jest.mocked(fetchStaffSessions).mockResolvedValue({ data: [session], hasMore: false });
  jest.mocked(fetchStaffSession).mockResolvedValue(session);
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
    await act(async () => ref.goBack());
    await press('Edit session');
    expect(ref.getCurrentRoute()?.name).toBe('AddEditSession');
    expect(ref.getCurrentRoute()?.params).toEqual({ sessionId: session._id });
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
