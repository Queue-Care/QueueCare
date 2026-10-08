import React from 'react';
import { RefreshControl, Text } from 'react-native';
import { MyBookingsScreen } from '../src/screens/MyBookingsScreen';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';
import type { RootStackParams } from '../src/navigation/types';
import { getPatientBookings } from '../src/features/patient/bookings';
import {
  bookingDetailsPayload,
  patientId,
} from '../test-utils/bookingFixtures';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
const saved = bookingDetailsPayload.data;
const summary = {
  _id: saved._id,
  bookingCode: saved.bookingCode,
  status: saved.status,
  hospitalName: saved.hospital.name,
  serviceName: saved.service.name,
  startsAt: saved.session.startsAt,
};
const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
const envelope = (data: unknown[], page = 1, total = data.length) => ({
  success: true,
  data,
  meta: {
    page,
    limit: 20,
    total,
    totalPages: Math.ceil(total / 20),
    hasNextPage: page * 20 < total,
  },
});
const response = (body: unknown, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => body,
});
const firstPage = Array.from({ length: 20 }, (_, i) => ({
  ...summary,
  _id: String(i + 1).padStart(24, '0'),
  bookingCode: `PAGE1-${i}`,
}));
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('limit=1')) return response(envelope([summary]));
    if (url.includes('status=past')) return response(envelope([]));
    if (url.includes('page=2')) return response(envelope([summary], 2, 21));
    if (url.includes('/bookings/me'))
      return response(envelope(firstPage, 1, 21));
    if (url.endsWith(`/bookings/${saved._id}`))
      return response(bookingDetailsPayload);
    throw new Error('Unexpected URL: ' + url);
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
});
async function mount() {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider>
        <AppNavigator
          navigationRef={ref}
          session={{
            userId: patientId,
            role: 'PATIENT',
            accessToken: 'login-token',
          }}
        />
      </SafeAreaProvider>,
    );
  });
}
async function pullToRefresh() {
  await act(async () => {
    renderer!.root
      .findByType(MyBookingsScreen)
      .findByType(RefreshControl)
      .props.onRefresh();
  });
}
async function press(label: string) {
  const control = renderer!.root
    .findAll(
      n =>
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function',
    )
    .pop();
  expect(control).toBeDefined();
  await act(async () => {
    control!.props.onPress();
  });
}
const hasText = (value: string) =>
  renderer!.root.findAllByType(Text).some(n => n.props.children === value);
async function tab(value: 'past' | 'upcoming') {
  const label = value === 'past' ? 'Past' : 'Upcoming';
  const control = renderer!.root
    .findAll(
      n =>
        n.props.accessibilityRole === 'tab' &&
        typeof n.props.onPress === 'function' &&
        n.findAllByType(Text).some(t => t.props.children === label),
    )
    .pop();
  expect(control).toBeDefined();
  await act(async () => control!.props.onPress());
}

test('Home summary and the paginated Bookings tab open the saved booking using the signed-in token', async () => {
  await mount();
  expect(hasText(summary.hospitalName)).toBe(true);
  await press('View booking');
  expect(ref.getCurrentRoute()).toMatchObject({
    name: 'BookingDetails',
    params: { bookingId: saved._id },
  });
  expect(hasText(saved.bookingCode)).toBe(true);
  await act(async () => {
    ref.navigate('PatientApp', {
      screen: 'Bookings',
      params: { screen: 'MyBookings' },
    });
  });
  expect(hasText('Page 1 · 21 upcoming bookings')).toBe(true);
  await press('Next bookings');
  expect(hasText('Page 2 · 21 upcoming bookings')).toBe(true);
  await press(`View ${summary.serviceName} booking ${summary.bookingCode}`);
  expect(ref.getCurrentRoute()).toMatchObject({
    name: 'BookingDetails',
    params: { bookingId: saved._id },
  });
  for (const [, options] of fetchMock.mock.calls)
    expect(options.headers.Authorization).toBe('Bearer login-token');
});

test('switching categories resets the page, aborts stale loads, and refresh can recover from errors', async () => {
  await mount();
  await press('My bookings');
  await press('Next bookings');
  let resolve!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await pullToRefresh();
  const pendingSignal = fetchMock.mock.calls.at(-1)![1].signal;
  await tab('past');
  expect(pendingSignal.aborted).toBe(true);
  expect(hasText('No past bookings')).toBe(true);
  expect(fetchMock.mock.calls.at(-1)![0]).toContain(
    'status=past&page=1&limit=20',
  );
  await act(async () => {
    resolve(response(envelope([summary], 2, 21)));
  });
  expect(hasText('No past bookings')).toBe(true);
  expect(hasText('Page 2 · 21 upcoming bookings')).toBe(false);
  fetchMock.mockResolvedValueOnce(response({}, 500));
  await pullToRefresh();
  expect(hasText('No past bookings')).toBe(false);
  await press('Try again');
  expect(hasText('No past bookings')).toBe(true);
});

test.each([
  { ...envelope([]), meta: undefined },
  envelope([summary], 2, 21),
  { ...envelope([summary]), meta: { ...envelope([summary]).meta, total: -1 } },
  envelope([{ ...summary, startsAt: 'invalid' }]),
  envelope([summary, summary]),
  envelope([{ ...summary, status: 'CANCELLED' }]),
])(
  'rejects malformed pagination or booking summaries instead of displaying an empty list',
  async body => {
    fetchMock.mockResolvedValueOnce(response(body));
    await expect(
      getPatientBookings('token', 'upcoming', 1, new AbortController().signal),
    ).rejects.toThrow();
  },
);
