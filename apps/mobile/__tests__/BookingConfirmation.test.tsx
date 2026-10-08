import React from 'react';
import { AppState, Text, RefreshControl } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BookingConfirmationScreen } from '../src/screens/BookingConfirmationScreen';
import { ActionButton } from '../src/components/ActionButton';
import {
  getBookingDetails,
  parseBookingDetails,
  BookingDetailsError,
  type BookingDetails,
} from '../src/features/booking/bookingDetails';
import {
  bookingDetailsPayload,
  patientId,
} from '../test-utils/bookingFixtures';
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/features/booking/bookingDetails', () => ({
  ...jest.requireActual('../src/features/booking/bookingDetails'),
  getBookingDetails: jest.fn(),
}));
const load = jest.mocked(getBookingDetails);
const bookingId = bookingDetailsPayload.data._id;
const saved = parseBookingDetails(bookingDetailsPayload, bookingId, patientId);
const view = jest.fn(),
  home = jest.fn(),
  expired = jest.fn();
let renderer: ReactTestRenderer.ReactTestRenderer;
function tree(reference = bookingId, token = 'test.jwt.token') {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <BookingConfirmationScreen
          bookingId={reference}
          patientId={patientId}
          accessToken={token}
          onViewBooking={view}
          onHome={home}
          onSessionExpired={expired}
        />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
async function mount() {
  await act(async () => {
    renderer = ReactTestRenderer.create(tree());
  });
}
test('confirmation displays the assigned appointment time and priority queue type', async () => {
  load.mockResolvedValue({ ...saved, assignedTime: '2026-10-03T03:55:00.000Z', queueType: 'PRIORITY' });
  await mount();
  const shown = renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join(' ');
  expect(shown).toContain('Appointment time:');
  expect(shown).toContain('09:25:00 am');
  expect(shown).toContain('Queue type: Priority');
});
function has(value: string) {
  return renderer.root
    .findAllByType(Text)
    .some(node => node.props.children === value);
}
function action(label: string) {
  return renderer.root
    .findAllByType(ActionButton)
    .find(node => node.props.label === label);
}
async function press(label: string) {
  await act(async () => {
    action(label)!.props.onPress();
  });
}
function deferred() {
  let resolve!: (value: BookingDetails) => void;
  const promise = new Promise<BookingDetails>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-03T02:00:00Z') });
  load.mockReset().mockResolvedValue(saved);
  view.mockReset();
  home.mockReset();
  expired.mockReset();
});
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test('renders persisted ID, hospital, service and Sri Lanka date/time with working actions', async () => {
  await mount();
  for (const value of [
    'Booking confirmed',
    saved.bookingCode,
    'Test Hospital',
    'General OPD',
    'Test address',
    'Saturday, 3 October 2026',
    'Sri Lanka time (Asia/Colombo)',
    'Test team',
  ])
    expect(has(value)).toBe(true);
  const code = renderer.root
    .findAllByType(Text)
    .find(node => node.props.children === saved.bookingCode)!;
  expect(code.props.selectable).toBe(true);
  expect(code.props.numberOfLines).toBeUndefined();
  expect(load).toHaveBeenCalledWith(
    bookingId,
    patientId,
    'test.jwt.token',
    expect.anything(),
  );
  await press('View booking');
  expect(view).toHaveBeenCalledWith(bookingId);
  await press('Back to Home');
  expect(home).toHaveBeenCalledTimes(1);
});
test.each([
  ['CANCELLED', 'Booking cancelled'],
  ['COMPLETED', 'Appointment completed'],
  ['SKIPPED', 'Appointment skipped'],
  ['RESCHEDULED', 'Booking rescheduled'],
] as const)(
  '%s never celebrates a newly confirmed booking',
  async (status, heading) => {
    load.mockResolvedValue({ ...saved, status });
    await mount();
    expect(has(heading)).toBe(true);
    expect(has('Booking confirmed')).toBe(false);
  },
);
test('cancelled sessions and inactive hospitals show the current warning', async () => {
  load.mockResolvedValue({
    ...saved,
    hospital: { ...saved.hospital, isActive: false },
    session: { ...saved.session, status: 'CANCELLED' },
  });
  await mount();
  expect(has('Session cancelled')).toBe(true);
  expect(has('Booking confirmed')).toBe(false);
  expect(
    renderer.root
      .findAllByType(Text)
      .filter(node => node.props.accessibilityRole === 'alert'),
  ).toHaveLength(2);
});
test('loading never invents success and refresh replaces confirmed state with cancellation', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise);
  await mount();
  expect(has('Loading your booking…')).toBe(true);
  expect(has('Booking confirmed')).toBe(false);
  expect(action('View booking')).toBeUndefined();
  await act(async () => {
    pending.resolve(saved);
  });
  expect(has('Booking confirmed')).toBe(true);
  load.mockResolvedValue({ ...saved, status: 'CANCELLED' });
  await act(async () => {
    renderer.root.findByType(RefreshControl).props.onRefresh();
  });
  expect(has('Booking cancelled')).toBe(true);
  expect(has('Booking confirmed')).toBe(false);
});
test.each([
  ['authentication', 'Sign in to view your booking'],
  ['forbidden', 'Booking access unavailable'],
  ['unavailable', 'Booking not found'],
  ['incomplete', 'Booking summary unavailable'],
  ['network', 'We couldn’t load your booking'],
] as const)('%s shows a safe recovery state', async (kind, heading) => {
  load.mockRejectedValueOnce(new BookingDetailsError(kind));
  await mount();
  expect(has(heading)).toBe(true);
  expect(action('View booking')).toBeUndefined();
  expect(has('Booking confirmed')).toBe(false);
  if (kind === 'authentication' || kind === 'forbidden') {
    await press('Sign in again');
    expect(expired).toHaveBeenCalledTimes(1);
  } else if (kind !== 'unavailable') {
    await press('Try again');
    expect(has('Booking confirmed')).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  }
});
test('replacement route aborts the old request and ignores late completion', async () => {
  const old = deferred();
  load.mockReturnValueOnce(old.promise);
  await mount();
  const signal = load.mock.calls[0][3];
  const nextId = 'abcdef000000000000000402';
  load.mockResolvedValue({ ...saved, id: nextId, bookingCode: 'OPD-NEXT' });
  await act(async () => {
    renderer.update(tree(nextId));
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    old.resolve(saved);
  });
  expect(has('OPD-NEXT')).toBe(true);
  expect(has(saved.bookingCode)).toBe(false);
});
test('token replacement hides old data, and unmount aborts pending requests', async () => {
  await mount();
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise);
  await act(async () => {
    renderer.update(tree(bookingId, 'replacement.jwt.token'));
  });
  expect(has(saved.bookingCode)).toBe(false);
  expect(has('Loading your booking…')).toBe(true);
  const signal = load.mock.calls[1][3];
  await act(async () => {
    renderer.unmount();
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve(saved);
  });
});
test('background cancels transport and foreground reloads current saved state', async () => {
  const listener = jest.spyOn(AppState, 'addEventListener').mockClear();
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise);
  await mount();
  const callbacks = listener.mock.calls
    .filter(([event]) => event === 'change')
    .map(([, callback]) => callback);
  const signal = load.mock.calls[0][3];
  await act(async () => {
    callbacks.forEach(callback => callback('background'));
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    callbacks.forEach(callback => callback('active'));
  });
  expect(load).toHaveBeenCalledTimes(2);
  expect(has(saved.bookingCode)).toBe(true);
});
