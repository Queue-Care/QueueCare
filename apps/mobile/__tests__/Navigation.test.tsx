import React from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  AppNavigator,
  type AppNavigatorProps,
} from '../src/navigation/AppNavigator';
import type { RootStackParams } from '../src/navigation/types';
import { NavigationPage } from '../src/navigation/NavigationPage';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

let renderer: ReactTestRenderer.ReactTestRenderer;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;

function tree(props: AppNavigatorProps = {}) {
  return (
    <SafeAreaProvider>
      <AppNavigator {...props} navigationRef={ref} />
    </SafeAreaProvider>
  );
}
async function mount(props: AppNavigatorProps = {}) {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(tree(props));
  });
}
async function press(label: string) {
  const button = renderer.root
    .findAll(
      item =>
        item.props.accessibilityLabel === label &&
        typeof item.props.onPress === 'function',
    )
    .pop();
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
  });
}
async function change(action: () => void) {
  await act(async () => {
    action();
  });
}

afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
});

test('welcome offers registration, role selection, and working back navigation', async () => {
  await mount();
  expect(ref.getCurrentRoute()?.name).toBe('Welcome');
  await press('Get Started');
  expect(ref.getCurrentRoute()?.name).toBe('ChooseRole');
  await press('Patient');
  expect(ref.getCurrentRoute()?.name).toBe('PatientCreateAccount');
  await change(() => ref.goBack());
  expect(ref.getCurrentRoute()?.name).toBe('PatientSignIn');
  await press('Forgot password?');
  expect(ref.getCurrentRoute()?.name).toBe('ResetPassword');
});

test('existing staff accounts reach sign-in without entering staff-only screens', async () => {
  await mount();
  await press('I already have an account');
  await press('Hospital staff');
  expect(ref.getCurrentRoute()?.name).toBe('StaffSignIn');
  expect(ref.getRootState()?.routeNames).not.toContain('StaffApp');
  expect(ref.getRootState()?.routeNames).not.toContain('PatientApp');
  await press('Don’t have an account? Request a staff account');
  expect(ref.getCurrentRoute()?.name).toBe('StaffRegistration');
  await change(() => ref.goBack());
  await press('Reset password');
  expect(ref.getCurrentRoute()?.name).toBe('ResetPassword');
});

test('guests can search hospitals and are prompted to sign in for bookings', async () => {
  await mount();
  await press('Continue as guest');
  await press('Search hospitals');
  expect(ref.getCurrentRoute()?.name).toBe('HospitalSearch');
  await change(() => ref.goBack());
  expect(ref.getCurrentRoute()?.name).toBe('PatientHome');
  await press('Back to welcome');
  expect(ref.getCurrentRoute()?.name).toBe('Welcome');
  await press('Continue as guest');
  await change(() => ref.navigate('Guest', { screen: 'Bookings' }));
  expect(
    renderer.root
      .findAllByType(NavigationPage)
      .some(page => page.props.title === 'Sign in to continue'),
  ).toBe(true);
  await press('Patient sign in');
  expect(ref.getCurrentRoute()?.name).toBe('PatientSignIn');
});

test('guest booking routes remain gated when navigated to directly', async () => {
  await mount();
  await change(() =>
    ref.navigate('Guest', {
      screen: 'Home',
      params: {
        screen: 'BookAppointment',
        params: { hospitalId: 'hospital-1' },
      },
    }),
  );
  expect(ref.getCurrentRoute()?.name).toBe('BookAppointment');
  expect(
    renderer.root
      .findAllByType(NavigationPage)
      .some(page => page.props.title === 'Sign in to continue'),
  ).toBe(true);
});

test('patient routes retain their booking and request identifiers', async () => {
  await mount({ session: { userId: 'patient-1', role: 'PATIENT' } });
  expect(ref.getRootState()?.routeNames).toEqual(['PatientApp']);
  await change(() =>
    ref.navigate('PatientApp', {
      screen: 'Home',
      params: {
        screen: 'BookingConfirmation',
        params: { bookingId: 'booking-1' },
      },
    }),
  );
  expect(ref.getCurrentRoute()?.params).toEqual({ bookingId: 'booking-1' });
  await change(() =>
    ref.navigate('PatientApp', {
      screen: 'Bookings',
      params: { screen: 'BookingDetails', params: { bookingId: 'booking-1' } },
    }),
  );
  expect(ref.getCurrentRoute()?.name).toBe('BookingDetails');
  await change(() =>
    ref.navigate('PatientApp', {
      screen: 'Bookings',
      params: {
        screen: 'PriorityRequestStatus',
        params: { requestId: 'request-1' },
      },
    }),
  );
  expect(ref.getCurrentRoute()?.params).toEqual({ requestId: 'request-1' });
});

test.each(['RECEPTION', 'NURSE'] as const)(
  '%s sessions reach staff tabs, add/edit sessions, and request details',
  async role => {
    await mount({ session: { userId: 'staff-1', role } });
    expect(ref.getRootState()?.routeNames).toEqual(['StaffApp']);
    await press('View sessions');
    expect(ref.getCurrentRoute()?.name).toBe('SessionsList');
    await press('Add a session');
    expect(ref.getCurrentRoute()?.name).toBe('AddEditSession');
    await change(() =>
      ref.navigate('StaffApp', {
        screen: 'Sessions',
        params: {
          screen: 'AddEditSession',
          params: { sessionId: 'session-1' },
        },
      }),
    );
    expect(ref.getCurrentRoute()?.params).toEqual({ sessionId: 'session-1' });
    await change(() =>
      ref.navigate('StaffApp', {
        screen: 'Priority',
        params: {
          screen: 'PriorityRequestDetails',
          params: { requestId: 'request-1' },
        },
      }),
    );
    expect(ref.getCurrentRoute()?.name).toBe('PriorityRequestDetails');
  },
);

test('sign-out removes staff history and returns to welcome', async () => {
  await mount({ session: { userId: 'staff-1', role: 'RECEPTION' } });
  await press('View sessions');
  await act(async () => {
    renderer.update(tree({ session: null }));
  });
  expect(ref.getCurrentRoute()?.name).toBe('Welcome');
  expect(ref.canGoBack()).toBe(false);
  expect(ref.getRootState()?.routeNames).not.toContain('StaffApp');
});

test('restoring a session shows loading before choosing the correct app', async () => {
  await mount({ isRestoring: true });
  expect(ref.isReady()).toBe(false);
  await act(async () => {
    renderer.update(
      tree({ session: { userId: 'patient-1', role: 'PATIENT' } }),
    );
  });
  expect(ref.getRootState()?.routeNames).toEqual(['PatientApp']);
});
