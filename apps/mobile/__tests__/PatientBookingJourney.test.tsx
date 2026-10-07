import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../src/App';
import { PatientHomeScreen } from '../src/screens/PatientHomeScreen';
import { PatientSignInScreen } from '../src/screens/PatientSignInScreen';
import { BookAppointmentScreen } from '../src/screens/BookAppointmentScreen';
import { BookingConfirmationScreen } from '../src/screens/BookingConfirmationScreen';
import { BookingDetailsScreen } from '../src/screens/BookingDetailsScreen';
import { NotificationsScreen } from '../src/screens/NotificationsScreen';
import { ActionButton } from '../src/components/ActionButton';
import { bookingMessages } from '../src/features/booking/createBooking';
import {
  hospital,
  hospitalId,
  serviceId,
  session,
  envelope,
} from '../test-utils/sessionFixtures';
import {
  bookingPayload,
  bookingDetailsPayload,
  patientId,
} from '../test-utils/bookingFixtures';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const password = 'Test-only-password123';
const identity = {
  fullName: 'Journey Test Patient',
  nic: '200012345678',
  mobile: '0771234567',
  password,
};
const token = 'server-issued-test-token';
let renderer: ReactTestRenderer.ReactTestRenderer;
let registered: boolean, created: boolean, read: boolean, full: boolean;
const noticeId = 'a'.repeat(24);
const notice = () => ({
  _id: noticeId,
  type: 'BOOKING',
  title: 'Booking confirmed',
  message: 'Open your saved booking.',
  data: { event: 'BOOKING_CONFIRMED', bookingId: bookingPayload.data._id },
  createdAt: bookingPayload.data.createdAt,
  readAt: read ? '2026-10-03T02:01:00.000Z' : null,
});
const summary = {
  _id: bookingPayload.data._id,
  bookingCode: bookingPayload.data.bookingCode,
  status: 'CONFIRMED',
  hospitalName: hospital.name,
  serviceName: 'General OPD',
  startsAt: session.startsAt,
};
const reply = (data: unknown, status = 200, meta = {}) => ({
  ok: status < 400,
  status,
  json: async () => ({ success: status < 400, data, meta }),
});
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-03T02:00:00Z') });
  registered = created = read = full = false;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  // Only HTTP transport is replaced: App startup, forms, auth handoff, adapters,
  // hooks and every navigator are real. Unknown requests fail this scenario.
  fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
    const path = url.replace('http://localhost:4000/api/v1', '');
    const body = options.body ? JSON.parse(String(options.body)) : undefined;
    if (path === '/auth/patient/register') {
      expect(body).toEqual(identity);
      registered = true;
      return reply({ registered: true }, 201);
    }
    if (path === '/auth/patient/login') {
      if (
        !registered ||
        body.nic !== identity.nic ||
        body.password !== password
      )
        return reply(null, 401);
      return reply({
        userId: patientId,
        role: 'PATIENT',
        accessToken: token,
        patient: { fullName: identity.fullName, nic: identity.nic },
      });
    }
    if (path.startsWith('/hospitals?'))
      return reply([{ ...hospital, _id: hospitalId }], 200, {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
      });
    if (path === `/hospitals/${hospitalId}`)
      return reply({ ...hospital, _id: hospitalId });
    if (path === `/hospitals/${hospitalId}/services`)
      return reply([{ _id: serviceId, hospitalId, name: 'General OPD' }], 200, {
        total: 1,
      });
    if (path.startsWith(`/hospitals/${hospitalId}/sessions?`)) {
      const payload = envelope(full ? [] : [session]);
      return reply(payload.data, 200, payload.meta);
    }
    expect((options.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${token}`,
    );
    if (path.startsWith('/bookings/me?'))
      return reply(created && !full ? [summary] : [], 200, {
        page: 1,
        limit: path.endsWith('limit=1') ? 1 : 20,
        total: created && !full ? 1 : 0,
        totalPages: created && !full ? 1 : 0,
        hasNextPage: false,
      });
    if (path === '/bookings' && options.method === 'POST') {
      expect(body).toEqual({ sessionId: session._id });
      if (full)
        return {
          ok: false,
          status: 409,
          json: async () => ({
            success: false,
            error: { code: 'SESSION_FULL', message: 'Full' },
          }),
        };
      created = true;
      return reply(bookingPayload.data, 201);
    }
    if (path === `/bookings/${bookingPayload.data._id}` && created && !full)
      return reply(bookingDetailsPayload.data);
    if (path === '/notifications')
      return reply(created && !full ? [notice()] : [], 200, {
        unreadCount: created && !full && !read ? 1 : 0,
      });
    if (
      path === `/notifications/${noticeId}/read` &&
      options.method === 'PATCH'
    ) {
      read = true;
      return reply(notice());
    }
    throw new Error(
      `Unexpected journey request: ${options.method ?? 'GET'} ${path}`,
    );
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
  jest.useRealTimers();
});
const hasText = (value: string) =>
  renderer.root.findAllByType(Text).some(n => n.props.children === value);
async function press(label: string) {
  const button = renderer.root
    .findAll(
      n =>
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function',
    )
    .pop();
  expect(button).toBeDefined();
  expect(button!.props.disabled).not.toBe(true);
  await act(async () => {
    button!.props.onPress();
  });
}
async function fill(label: string, value: string) {
  const input = renderer.root
    .findAllByType(TextInput)
    .filter(n => n.props.accessibilityLabel === label)
    .pop();
  expect(input).toBeDefined();
  await act(async () => input!.props.onChangeText(value));
}
async function register() {
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await press('Get Started');
  await press('Patient');
  for (const [label, value] of [
    ['Full name', identity.fullName],
    ['NIC number', identity.nic],
    ['Mobile number', identity.mobile],
    ['Create password', password],
    ['Confirm password', password],
  ])
    await fill(label, value);
  await press('Create account');
  expect(
    fetchMock.mock.calls.map(([url, options]) => [url, options.body]),
  ).toEqual([
    [
      'http://localhost:4000/api/v1/auth/patient/register',
      JSON.stringify(identity),
    ],
  ]);
  expect(hasText('Account created. Sign in to continue.')).toBe(true);
  expect(renderer.root.findAllByType(PatientHomeScreen)).toHaveLength(0);
  await fill('NIC number', identity.nic);
  await fill('Password', password);
}
async function discover() {
  await press('Search hospitals');
  await fill('Hospital name or city', 'Test');
  await fill('City filter', 'Colombo');
  await press('Find hospitals');
  expect(
    fetchMock.mock.calls.some(
      ([url]) => url.includes('search=Test') && url.includes('city=Colombo'),
    ),
  ).toBe(true);
  await press(`View ${hospital.name}, ${hospital.city}`);
  await press('General OPD');
  await press('View OPD sessions');
  const form = renderer.root.findByType(BookAppointmentScreen);
  expect(form.props.patient.fullName).toBe(identity.fullName);
  const action = form
    .findAllByType(ActionButton)
    .find(n => n.props.label === 'Confirm appointment')!;
  expect(action.props.disabled).toBe(true);
  const slot = form
    .findAll(
      n =>
        n.props.accessibilityRole === 'radio' &&
        typeof n.props.onPress === 'function',
    )
    .pop()!;
  await act(async () => slot.props.onPress());
}

test('App registration -> login -> search -> service -> session -> confirm -> details -> Home -> alert uses one saved booking', async () => {
  await register();
  await press('Sign in');
  expect(renderer.root.findAllByType(PatientSignInScreen)).toHaveLength(0);
  expect(hasText('No upcoming appointments')).toBe(true);
  await discover();
  await press('Confirm appointment');
  const confirmation = renderer.root.findByType(BookingConfirmationScreen);
  expect(confirmation.props.bookingId).toBe(bookingPayload.data._id);
  expect(renderer.root.findAllByType(BookAppointmentScreen)).toHaveLength(0);
  expect(hasText(bookingPayload.data.bookingCode)).toBe(true);
  await press('View booking');
  expect(
    renderer.root.findByType(BookingDetailsScreen).props.route.params.bookingId,
  ).toBe(bookingPayload.data._id);
  // Switch back to the Home stack, then use the confirmation's visible Home action.
  const homeTab = renderer.root
    .findAll(
      n =>
        typeof n.props.onPress === 'function' &&
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Home'),
    )
    .pop();
  expect(homeTab).toBeDefined();
  await act(async () => homeTab!.props.onPress());
  await press('Back to Home');
  expect(hasText(hospital.name)).toBe(true);
  await press('Notifications');
  expect(renderer.root.findAllByType(NotificationsScreen)).toHaveLength(1);
  const alert = renderer.root
    .findAll(
      n =>
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Booking confirmed.') &&
        typeof n.props.onPress === 'function',
    )
    .pop()!;
  await act(async () => alert.props.onPress());
  expect(read).toBe(true);
  expect(
    renderer.root.findByType(BookingDetailsScreen).props.route.params.bookingId,
  ).toBe(bookingPayload.data._id);
  expect(
    fetchMock.mock.calls.filter(
      ([url, options]) =>
        url.endsWith('/bookings') && options.method === 'POST',
    ),
  ).toHaveLength(1);
});

test('wrong login stays signed out and the same registration can recover with the correct password', async () => {
  await register();
  await fill('Password', 'wrong-password');
  await press('Sign in');
  expect(hasText('NIC or password is incorrect.')).toBe(true);
  expect(renderer.root.findAllByType(PatientHomeScreen)).toHaveLength(0);
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/bookings'))).toBe(
    false,
  );
  await fill('Password', password);
  await press('Sign in');
  expect(hasText('No upcoming appointments')).toBe(true);
});

test('a session filled after selection shows recovery and never creates a false confirmation', async () => {
  await register();
  await press('Sign in');
  await discover();
  full = true;
  await press('Confirm appointment');
  expect(hasText(bookingMessages.full)).toBe(true);
  expect(renderer.root.findAllByType(BookingConfirmationScreen)).toHaveLength(
    0,
  );
  expect(
    fetchMock.mock.calls.filter(
      ([url, options]) =>
        url.endsWith('/bookings') && options.method === 'POST',
    ),
  ).toHaveLength(1);
  expect(
    fetchMock.mock.calls.some(([url]) =>
      url.endsWith(`/bookings/${bookingPayload.data._id}`),
    ),
  ).toBe(false);
});
