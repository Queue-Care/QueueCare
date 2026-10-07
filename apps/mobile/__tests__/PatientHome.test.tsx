import React from 'react';
import { RefreshControl, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';
import type {
  NavigationSession,
  RootStackParams,
} from '../src/navigation/types';
import {
  getNextAppointment,
  type NextAppointment,
} from '../src/features/home/nextAppointment';
import { NextAppointmentCard } from '../src/components/NextAppointmentCard';
import { PatientHomeScreen } from '../src/screens/PatientHomeScreen';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/features/home/nextAppointment', () => ({
  getNextAppointment: jest.fn(),
}));
const load = jest.mocked(getNextAppointment);
const appointment: NextAppointment = {
  bookingId: 'booking-1',
  bookingCode: 'OPD-101',
  hospitalName: 'Test Hospital',
  serviceName: 'General OPD',
  startsAt: '2026-10-04T03:30:00Z',
};
const patient: NavigationSession = {
  userId: 'patient-1',
  role: 'PATIENT',
  accessToken: 'test-token',
};
let renderer: ReactTestRenderer.ReactTestRenderer;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
function tree(session: NavigationSession | null) {
  return (
    <SafeAreaProvider>
      <AppNavigator session={session} navigationRef={ref} />
    </SafeAreaProvider>
  );
}
async function mount(session: NavigationSession | null = patient) {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(tree(session));
  });
}
async function press(label: string) {
  const button = renderer.root
    .findAll(
      node =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === 'function',
    )
    .pop();
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
  });
}
function hasText(value: string) {
  return renderer.root
    .findAllByType(Text)
    .some(node => node.props.children === value);
}
function deferred() {
  let resolve!: (value: NextAppointment | null) => void;
  const promise = new Promise<NextAppointment | null>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  load.mockReset();
  load.mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => {
    renderer.unmount();
  });
});

test('guests see a sign-in prompt and never request private appointments', async () => {
  await mount(null);
  await press('Continue as guest');
  expect(hasText('Your visits, in one place')).toBe(true);
  expect(load).not.toHaveBeenCalled();
  await press('My bookings');
  expect(ref.getCurrentRoute()?.name).toBe('PatientSignIn');
});

test('loads the next appointment, displays Sri Lanka time, and opens its booking ID', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise);
  await mount();
  expect(hasText('Loading your next appointment…')).toBe(true);
  await act(async () => {
    pending.resolve(appointment);
  });
  expect(
    renderer.root.findByType(NextAppointmentCard).props.appointment,
  ).toEqual(appointment);
  const labels = renderer.root
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(
    labels.some(label => Array.isArray(label) && label.includes('9:00 AM')),
  ).toBe(true);
  await press('View booking');
  expect(ref.getCurrentRoute()).toMatchObject({
    name: 'BookingDetails',
    params: { bookingId: 'booking-1' },
  });
});

test('an empty result displays an honest empty state and hospital search works', async () => {
  await mount();
  expect(hasText('No upcoming appointments')).toBe(true);
  await press('Search hospitals');
  expect(ref.getCurrentRoute()?.name).toBe('HospitalSearch');
});

test.each(['guest', 'loading', 'empty', 'error', 'appointment'])(
  '%s Home search bar stays available in every appointment state',
  async scenario => {
    if (scenario === 'loading') load.mockReturnValueOnce(deferred().promise);
    if (scenario === 'error') load.mockRejectedValueOnce(new Error('offline'));
    if (scenario === 'appointment') load.mockResolvedValueOnce(appointment);
    await mount(scenario === 'guest' ? null : patient);
    if (scenario === 'guest') await press('Continue as guest');

    const home = renderer.root.findByType(PatientHomeScreen);
    const search = home.findAll(node => node.props.accessibilityLabel === 'Search hospitals' && typeof node.props.onPress === 'function');
    expect(search.length).toBeGreaterThan(0);
    expect(search[0].props.disabled).not.toBe(true);
    expect(search[0].props.accessibilityHint).toBe(
      'Search hospitals or clinics',
    );
    expect(hasText('Search hospitals or clinics')).toBe(true);
    if (scenario === 'guest') expect(load).not.toHaveBeenCalled();

    await press('Search hospitals');
    expect(ref.getCurrentRoute()?.name).toBe('HospitalSearch');
    if (scenario === 'guest') expect(load).not.toHaveBeenCalled();
  },
);

test('a failed request shows retry rather than no appointments', async () => {
  load
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(appointment);
  await mount();
  expect(hasText('We couldn’t load your appointment')).toBe(true);
  expect(hasText('No upcoming appointments')).toBe(false);
  await press('Try again');
  expect(
    renderer.root.findByType(NextAppointmentCard).props.appointment,
  ).toEqual(appointment);
});

test('pull-to-refresh replaces the previous appointment with fresh data', async () => {
  load.mockResolvedValueOnce(appointment).mockResolvedValueOnce(null);
  await mount();
  await act(async () => {
    renderer.root.findByType(RefreshControl).props.onRefresh();
  });
  expect(hasText('No upcoming appointments')).toBe(true);
  expect(renderer.root.findAllByType(NextAppointmentCard)).toHaveLength(0);
});

test('quick actions switch tabs and returning Home refreshes the appointment', async () => {
  await mount();
  await press('Notifications');
  expect(ref.getCurrentRoute()?.name).toBe('Alerts');
  await act(async () => {
    ref.navigate('PatientApp', { screen: 'Home' });
  });
  expect(load).toHaveBeenCalledTimes(2);
  await press('My bookings');
  expect(ref.getCurrentRoute()?.name).toBe('MyBookings');
});

test('changing a token cancels the old request and ignores its late result', async () => {
  const old = deferred();
  const fresh = deferred();
  load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  await mount();
  const signal = load.mock.calls[0][1];
  await act(async () => {
    renderer.update(tree({ ...patient, accessToken: 'new-token' }));
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    fresh.resolve(null);
  });
  await act(async () => {
    old.resolve(appointment);
  });
  expect(hasText('No upcoming appointments')).toBe(true);
  expect(renderer.root.findAllByType(NextAppointmentCard)).toHaveLength(0);
});
