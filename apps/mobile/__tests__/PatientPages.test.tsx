import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  CreateAccountScreen,
  validateRegistration,
} from '../src/screens/CreateAccountScreen';
import {
  parseBooking,
  parsePriority,
  patientApi,
} from '../src/features/patient/api';
import type {
  PatientAuthParams,
  RootStackParams,
  NavigationSession,
} from '../src/navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { bookingDetailsPayload } from '../test-utils/bookingFixtures';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
const values = {
  fullName: 'Kasun Perera',
  nic: '200145601234',
  mobile: '+94 77 123 4567',
  email: '',
  password: 'password123',
  confirmPassword: 'password123',
};
const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000/api/v1';
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
});

test('registration accepts both NIC formats and validates optional email and mobile', () => {
  expect(validateRegistration(values)).toEqual({});
  expect(
    validateRegistration({
      ...values,
      nic: '912345678V',
      mobile: '0771234567',
    }),
  ).toEqual({});
  expect(
    validateRegistration({
      ...values,
      nic: '123',
      mobile: '123',
      email: 'invalid',
      password: 'short',
    }),
  ).toEqual(
    expect.objectContaining({
      nic: expect.any(String),
      mobile: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
    }),
  );
});

test('registration requires matching confirmation', () => {
  expect(validateRegistration({ ...values, confirmPassword: '' }).confirmPassword)
    .toBe('Confirm your password.');
  expect(validateRegistration({ ...values, confirmPassword: 'different123' }).confirmPassword)
    .toBe('Passwords do not match.');
});

test('invalid registration shows field errors without sending an API request', async () => {
  const navigation = { navigate: jest.fn() };
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <CreateAccountScreen
        {...({
          navigation,
          route: { key: 'create', name: 'PatientCreateAccount' },
        } as unknown as NativeStackScreenProps<
          PatientAuthParams,
          'PatientCreateAccount'
        >)}
      />,
    );
  });
  await act(async () => {
    renderer!.root
      .findAll(
        item =>
          item.props.accessibilityLabel === 'Create account' &&
          typeof item.props.onPress === 'function',
      )
      .pop()!
      .props.onPress();
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(item => item.props.children === 'Enter your full name.'),
  ).toBe(true);
});

test('registration sends trimmed values and opens login only after server success', async () => {
  const navigation = { navigate: jest.fn(), reset: jest.fn() };
  fetchMock.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ success: true, data: { registered: true } }),
  });
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <CreateAccountScreen
        {...({
          navigation,
          route: { key: 'create', name: 'PatientCreateAccount' },
        } as unknown as NativeStackScreenProps<
          PatientAuthParams,
          'PatientCreateAccount'
        >)}
      />,
    );
  });
  for (const [label, value] of [
    ['Full name', values.fullName],
    ['NIC number', values.nic],
    ['Mobile number', values.mobile],
    ['Create password', values.password],
    ['Confirm password', values.confirmPassword],
  ]) {
    await act(async () => {
      renderer!.root
        .findAll(
          item =>
            item.props.accessibilityLabel === label &&
            typeof item.props.onChangeText === 'function',
        )
        .pop()!
        .props.onChangeText(value);
    });
  }
  await act(async () => {
    await renderer!.root
      .findAll(
        item =>
          item.props.accessibilityLabel === 'Create account' &&
          typeof item.props.onPress === 'function',
      )
      .pop()!
      .props.onPress();
  });
  expect(navigation.reset).toHaveBeenCalledWith({
    index: 0,
    routes: [{ name: 'PatientSignIn', params: { registered: true } }],
  });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    fullName: values.fullName,
    nic: values.nic,
    mobile: '+94771234567',
    password: values.password,
  });
});

test('successful patient login changes the root navigation to patient home', async () => {
  const ref = createNavigationContainerRef<RootStackParams>();
  function Harness() {
    const [session, setSession] = React.useState<NavigationSession | null>(
      null,
    );
    return (
      <SafeAreaProvider>
        <AppNavigator
          session={session}
          onSignedIn={setSession}
          navigationRef={ref}
        />
      </SafeAreaProvider>
    );
  }
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        userId: '000000000000000000000001',
        accessToken: 'server-token',
        role: 'PATIENT',
        patient: { fullName: 'Kasun Perera' },
      },
    }),
  });
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
  });
  await act(async () => {
    ref.navigate('PatientAuth', { screen: 'PatientSignIn' });
  });
  for (const [label, value] of [
    ['NIC number', values.nic],
    ['Password', values.password],
  ]) {
    await act(async () => {
      renderer!.root
        .findAll(
          item =>
            item.props.accessibilityLabel === label &&
            typeof item.props.onChangeText === 'function',
        )
        .pop()!
        .props.onChangeText(value);
    });
  }
  await act(async () => {
    await renderer!.root
      .findAll(
        item =>
          item.props.accessibilityLabel === 'Sign in' &&
          typeof item.props.onPress === 'function',
      )
      .pop()!
      .props.onPress();
  });
  expect(ref.getCurrentRoute()?.name).toBe('PatientHome');
  expect(ref.getRootState()?.routeNames).not.toContain('PatientAuth');
  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://localhost:3000/api/v1/auth/patient/login',
  );
});

test('protected requests require a token and do not expose raw server errors', async () => {
  await expect(patientApi('/bookings/me')).rejects.toThrow('Please sign in');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ message: 'private database details' }),
  });
  await expect(patientApi('/bookings/me', { token: 'token' })).rejects.toThrow(
    'We could not complete',
  );
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
});

test('booking and priority contracts reject malformed dates and unexpected statuses', () => {
  const booking = {
    _id: 'booking-1',
    bookingCode: 'OPD-101',
    hospitalName: 'Hospital',
    serviceName: 'General OPD',
    startsAt: '2026-10-04T09:00:00+05:30',
    status: 'CONFIRMED',
  };
  expect(parseBooking(booking)).toEqual(booking);
  expect(() =>
    parseBooking({ ...booking, startsAt: '2026-10-04T09:00:00' }),
  ).toThrow();
  expect(() => parseBooking({ ...booking, status: 'APPROVED' })).toThrow();
  expect(() =>
    parsePriority({
      _id: 'request-1',
      bookingId: 'booking-1',
      reason: 'OTHER',
      status: 'ACCEPTED',
      createdAt: 'invalid',
    }),
  ).toThrow();
});

test('patient pages read the nested booking details returned by develop', () => {
  const booking = parseBooking(bookingDetailsPayload.data);
  expect(booking.hospitalName).toBe(bookingDetailsPayload.data.hospital.name);
  expect(booking.serviceName).toBe(bookingDetailsPayload.data.service.name);
  expect(booking.startsAt).toBe(bookingDetailsPayload.data.session.startsAt);
  expect(booking._id).toBe(bookingDetailsPayload.data._id);
  expect(() =>
    parseBooking({
      ...bookingDetailsPayload.data,
      session: { startsAt: 'invalid' },
    }),
  ).toThrow();
});

test.each([true, false])(
  'Home priority shortcut opens request status (has requests: %s)',
  async hasRequests => {
    const ref = createNavigationContainerRef<RootStackParams>();
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: url.endsWith('/priority-requests/me')
          ? hasRequests
            ? [
                {
                  _id: 'old',
                  bookingId: 'booking-1',
                  reason: 'OTHER',
                  status: 'DECLINED',
                  createdAt: '2026-10-01T12:00:00Z',
                },
                {
                  _id: 'new',
                  bookingId: 'booking-1',
                  reason: 'MOBILITY',
                  status: 'PENDING',
                  createdAt: '2026-10-04T12:00:00Z',
                },
              ]
            : []
          : url.includes('/bookings/me')
          ? []
          : {
              _id: 'booking-1',
              bookingCode: 'OPD-101',
              hospitalName: 'Hospital',
              serviceName: 'General OPD',
              startsAt: '2026-10-06T09:00:00+05:30',
              status: 'CONFIRMED',
            },
      }),
    }));
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider>
          <AppNavigator
            navigationRef={ref}
            session={{
              userId: 'patient-1',
              role: 'PATIENT',
              accessToken: 'token',
            }}
          />
        </SafeAreaProvider>,
      );
    });
    await act(async () => {
      await renderer!.root
        .findAll(
          item =>
            item.props.accessibilityLabel === 'Priority queue' &&
            typeof item.props.onPress === 'function',
        )
        .pop()!
        .props.onPress();
    });
    expect(ref.getCurrentRoute()?.name).toBe('PriorityRequestStatus');
    expect(
      renderer!.root
        .findAllByType(Text)
        .some(
          item =>
            item.props.children ===
            (hasRequests ? 'Under review' : 'No priority requests yet'),
        ),
    ).toBe(true);
  },
);

test('patient can open a booking, submit the selected priority reason, and return from status', async () => {
  const booking = {
    _id: 'booking-1',
    bookingCode: 'OPD-101',
    hospitalName: 'Hospital',
    serviceName: 'General OPD',
    startsAt: '2026-10-04T09:00:00+05:30',
    status: 'CONFIRMED',
  };
  const request = {
    _id: 'request-1',
    bookingId: 'booking-1',
    reason: 'MOBILITY',
    status: 'PENDING',
    createdAt: '2026-10-01T12:00:00Z',
  };
  fetchMock.mockImplementation(
    async (url: string, options: { method: string }) => {
      const data = url.endsWith('/priority-requests/me')
        ? [request]
        : url.endsWith('/priority-requests') && options.method === 'POST'
        ? request
        : url.includes('/bookings/me')
        ? [booking]
        : booking;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data,
          ...(url.includes('/bookings/me')
            ? {
                meta: {
                  page: 1,
                  limit: 20,
                  total: 1,
                  totalPages: 1,
                  hasNextPage: false,
                },
              }
            : {}),
        }),
      };
    },
  );
  const ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider>
        <AppNavigator
          navigationRef={ref}
          session={{
            userId: 'patient-1',
            role: 'PATIENT',
            accessToken: 'token',
          }}
        />
      </SafeAreaProvider>,
    );
  });
  await act(async () => {
    ref.navigate('PatientApp', { screen: 'Bookings' });
  });
  async function press(label: string) {
    await act(async () => {
      const button = renderer!.root
        .findAll(
          item =>
            item.props.accessibilityLabel === label &&
            typeof item.props.onPress === 'function',
        )
        .pop();
      expect(button).toBeDefined();
      await button!.props.onPress();
    });
  }
  await press('View General OPD booking OPD-101');
  expect(ref.getCurrentRoute()?.name).toBe('BookingDetails');
  await press('Request priority queue');
  await press('Mobility assistance');
  await press('Submit request');
  expect(ref.getCurrentRoute()?.name).toBe('PriorityRequestStatus');
  expect(ref.getCurrentRoute()?.params).toEqual({ requestId: 'request-1' });
  const post = fetchMock.mock.calls.find(
    ([url, options]) =>
      url.endsWith('/priority-requests') && options.method === 'POST',
  );
  expect(JSON.parse(post![1].body)).toEqual({ reason: 'MOBILITY', note: '' });
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(item => item.props.children === 'Under review'),
  ).toBe(true);
  await press('Back to booking');
  expect(ref.getCurrentRoute()?.params).toEqual({ bookingId: 'booking-1' });
});
