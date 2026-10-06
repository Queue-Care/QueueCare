import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';
import type {
  NavigationSession,
  RootStackParams,
} from '../src/navigation/types';
import { parseNotification } from '../src/features/notifications/g_notifications';
import {
  bookingDetailsPayload,
  patientId,
} from '../test-utils/bookingFixtures';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
const saved = bookingDetailsPayload.data;
const notification = {
  _id: 'a'.repeat(24),
  type: 'BOOKING',
  title: 'Booking confirmed',
  message: `Your booking ${saved.bookingCode} is confirmed.`,
  data: {
    event: 'BOOKING_CONFIRMED',
    bookingId: saved._id,
    sessionId: saved.sessionId,
  },
  createdAt: saved.createdAt,
  readAt: null as string | null,
};
const patient: NavigationSession = {
  userId: patientId,
  role: 'PATIENT',
  accessToken: 'patient-token',
};
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const fetchMock = jest.fn();
let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
let notice = notification;
let onSessionExpired: jest.Mock;
const response = (data: unknown, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => ({
    success: status === 200,
    data,
    meta: { unreadCount: notice.readAt ? 0 : 1 },
  }),
});
const receipt = () =>
  fetchMock.mock.calls.filter(
    ([url, options]) => url.endsWith('/read') && options.method === 'PATCH',
  );
const hasText = (value: string) =>
  renderer!.root.findAllByType(Text).some(n => n.props.children === value);
function tree(session: NavigationSession | null = patient) {
  return (
    <SafeAreaProvider>
      <AppNavigator
        session={session}
        navigationRef={ref}
        onSessionExpired={onSessionExpired}
      />
    </SafeAreaProvider>
  );
}
beforeEach(() => {
  notice = { ...notification };
  onSessionExpired = jest.fn();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
  fetchMock.mockImplementation(
    async (url: string, options: { method: string }) => {
      if (url.includes('/bookings/me')) return response([]);
      if (url.endsWith('/notifications')) return response([notice]);
      if (url.endsWith('/read') && options.method === 'PATCH') {
        notice = { ...notice, readAt: '2026-10-06T01:00:00.000Z' };
        return response(notice);
      }
      if (url.endsWith(`/bookings/${saved._id}`)) return response(saved);
      throw new Error('Unexpected URL: ' + url);
    },
  );
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
});
async function mount() {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(tree());
  });
  await act(async () => {
    ref.navigate('PatientApp', { screen: 'Alerts' });
  });
}
async function tapNotice() {
  const button = renderer!.root
    .findAll(
      n =>
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Booking confirmed.') &&
        typeof n.props.onPress === 'function',
    )
    .pop();
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
  });
}

test.each([false, true])(
  'booking alert (already read: %s) opens the persisted booking in the Bookings tab',
  async read => {
    if (read) notice = { ...notice, readAt: '2026-10-05T04:00:00.000Z' };
    await mount();
    expect(hasText('View booking')).toBe(true);
    await tapNotice();
    expect(ref.getCurrentRoute()).toMatchObject({
      name: 'BookingDetails',
      params: { bookingId: saved._id },
    });
    expect(hasText(saved.bookingCode)).toBe(true);
    expect(receipt()).toHaveLength(read ? 0 : 1);
    expect(
      fetchMock.mock.calls.find(([url]) =>
        url.endsWith(`/bookings/${saved._id}`),
      )![1].headers.Authorization,
    ).toBe('Bearer patient-token');
  },
);

test('a slow read receipt cannot delay navigation or affect a replacement account', async () => {
  await mount();
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await tapNotice();
  expect(ref.getCurrentRoute()?.name).toBe('BookingDetails');
  await act(async () => {
    renderer!.update(
      tree({ ...patient, userId: 'b'.repeat(24), accessToken: 'other-token' }),
    );
  });
  await act(async () => {
    resolve(response(null, 401));
  });
  expect(ref.getCurrentRoute()?.name).toBe('PatientHome');
  expect(onSessionExpired).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('a failed read receipt still opens details and reports that read state was not saved', async () => {
  await mount();
  fetchMock.mockResolvedValueOnce(response(null, 500));
  await tapNotice();
  expect(ref.getCurrentRoute()?.name).toBe('BookingDetails');
  expect(hasText(saved.bookingCode)).toBe(true);
  expect(Alert.alert).toHaveBeenCalled();
});

test('an unavailable linked booking renders an error rather than invented details', async () => {
  notice = { ...notice, readAt: '2026-10-05T04:00:00.000Z' };
  await mount();
  fetchMock.mockResolvedValueOnce(response(null, 404));
  await tapNotice();
  expect(ref.getCurrentRoute()?.name).toBe('BookingDetails');
  expect(hasText(saved.bookingCode)).toBe(false);
  expect(hasText('We could not complete this action. Please try again.')).toBe(
    true,
  );
});

test.each([
  undefined,
  {},
  { event: 'BOOKING_CONFIRMED', bookingId: '../other' },
  { event: 'BOOKING_CONFIRMED', bookingId: 42 },
  { event: 'OTHER', bookingId: saved._id },
])(
  'unrecognised or malformed notification metadata remains readable without a booking link',
  data => {
    const result = parseNotification({ ...notification, data });
    expect(result.title).toBe(notification.title);
    expect(result.bookingId).toBeUndefined();
  },
);

test('only booking-confirmed events can carry a booking navigation target', () => {
  expect(
    parseNotification({ ...notification, type: 'PRIORITY' }).bookingId,
  ).toBeUndefined();
  expect(
    parseNotification({
      ...notification,
      data: { ...notification.data, bookingId: saved._id.toUpperCase() },
    }).bookingId,
  ).toBe(saved._id);
});
