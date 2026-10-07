import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';
import type {
  NavigationSession,
  RootStackParams,
} from '../src/navigation/types';
import {
  createBooking,
  CreateBookingError,
  parseCreatedBooking,
  type CreatedBooking,
  type BookingErrorKind,
  bookingMessages,
} from '../src/features/booking/createBooking';
import {
  getAvailableSessions,
  parseAvailableSessions,
} from '../src/features/booking/availableSessions';
import { getHospitalDetails } from '../src/features/hospitals/hospitalDetails';
import { BookAppointmentScreen } from '../src/screens/BookAppointmentScreen';
import { ActionButton } from '../src/components/ActionButton';
import {
  date,
  envelope,
  hospital,
  hospitalId,
  serviceId,
  session,
} from '../test-utils/sessionFixtures';
import {
  bookingPayload,
  bookingDetailsPayload,
  patientId,
} from '../test-utils/bookingFixtures';
import {
  getBookingDetails,
  parseBookingDetails,
} from '../src/features/booking/bookingDetails';
jest.mock('../src/features/booking/bookingDetails', () => ({
  ...jest.requireActual('../src/features/booking/bookingDetails'),
  getBookingDetails: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/features/hospitals/hospitalDetails', () => ({
  ...jest.requireActual('../src/features/hospitals/hospitalDetails'),
  getHospitalDetails: jest.fn(),
}));
jest.mock('../src/features/booking/availableSessions', () => ({
  ...jest.requireActual('../src/features/booking/availableSessions'),
  getAvailableSessions: jest.fn(),
}));
jest.mock('../src/features/booking/createBooking', () => ({
  ...jest.requireActual('../src/features/booking/createBooking'),
  createBooking: jest.fn(),
}));
const post = jest.mocked(createBooking);
const load = jest.mocked(getAvailableSessions);
const saved = parseCreatedBooking(bookingPayload, patientId, session._id);
const patient: NavigationSession = {
  userId: patientId,
  role: 'PATIENT',
  accessToken: 'test.jwt.token',
  patient: { fullName: 'Test Patient' },
};
let renderer: ReactTestRenderer.ReactTestRenderer;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
const expired = jest.fn();
function tree(auth: NavigationSession | null = patient) {
  return (
    <SafeAreaProvider>
      <AppNavigator
        session={auth}
        onSessionExpired={expired}
        navigationRef={ref}
      />
    </SafeAreaProvider>
  );
}
function screen() {
  return renderer.root.findByType(BookAppointmentScreen);
}
function action(label: string) {
  return screen()
    .findAllByType(ActionButton)
    .find(node => node.props.label === label)!;
}
function hasText(value: string) {
  return renderer.root
    .findAllByType(Text)
    .some(node => node.props.children === value);
}
async function press(label: string) {
  await act(async () => {
    action(label).props.onPress();
  });
}
async function select() {
  await act(async () => {
    screen()
      .findAll(
        node =>
          node.props.accessibilityRole === 'radio' &&
          typeof node.props.onPress === 'function',
      )
      .pop()!
      .props.onPress();
  });
}
async function mount(auth: NavigationSession = patient) {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(tree(auth));
  });
  await act(async () => {
    ref.navigate('PatientApp', {
      screen: 'Home',
      params: { screen: 'BookAppointment', params: { hospitalId, serviceId } },
    });
  });
}
function deferred() {
  let resolve!: (value: CreatedBooking) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<CreatedBooking>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-03T02:00:00Z') });
  post.mockReset();
  load.mockReset();
  expired.mockReset();
  post.mockResolvedValue(saved);
  jest
    .mocked(getBookingDetails)
    .mockReset()
    .mockResolvedValue(
      parseBookingDetails(bookingDetailsPayload, saved.id, patientId),
    );
  load.mockResolvedValue(
    parseAvailableSessions(envelope(), { hospitalId, serviceId, date }),
  );
  jest.mocked(getHospitalDetails).mockResolvedValue(hospital);
});
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
  jest.useRealTimers();
});
test('valid patient selects, posts once despite rapid taps, and replaces form with persisted confirmation ID', async () => {
  const pending = deferred();
  post.mockReturnValueOnce(pending.promise);
  await mount();
  expect(action('Confirm appointment').props.disabled).toBe(true);
  await select();
  expect(action('Confirm appointment').props.disabled).toBe(false);
  const click = action('Confirm appointment').props.onPress;
  await act(async () => {
    click();
    click();
  });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith({
    patientId,
    sessionId: session._id,
    accessToken: patient.accessToken,
    signal: expect.anything(),
  });
  expect(action('Confirming appointment…').props.disabled).toBe(true);
  expect(action('Next day').props.disabled).toBe(true);
  expect(
    screen().find(
      node =>
        node.props.accessibilityLabel === 'Appointment date' &&
        typeof node.props.onPress === 'function',
    ).props.disabled,
  ).toBe(true);
  await press('Next day');
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve(saved);
  });
  expect(ref.getCurrentRoute()).toMatchObject({
    name: 'BookingConfirmation',
    params: { bookingId: saved.id },
  });
  expect(renderer.root.findAllByType(BookAppointmentScreen)).toHaveLength(0);
  expect(getBookingDetails).toHaveBeenCalledWith(
    saved.id,
    patientId,
    patient.accessToken,
    expect.anything(),
  );
  expect(hasText(bookingPayload.data.bookingCode)).toBe(true);
  const view = renderer.root
    .findAll(
      node =>
        node.props.accessibilityLabel === 'View booking' &&
        typeof node.props.onPress === 'function',
    )
    .pop()!;
  await act(async () => {
    view.props.onPress();
  });
  expect(ref.getCurrentRoute()).toMatchObject({
    name: 'BookingDetails',
    params: { bookingId: saved.id },
  });
});
test.each([
  { ...patient, accessToken: undefined },
  { ...patient, patient: undefined },
])('missing token or profile cannot create a booking (%#)', async auth => {
  await mount(auth);
  await select();
  expect(action('Confirm appointment').props.disabled).toBe(true);
  await press('Confirm appointment');
  expect(post).not.toHaveBeenCalled();
});
test.each(['full', 'unavailable', 'validation'] as BookingErrorKind[])(
  '%s refreshes availability, clears selection, and never opens confirmation',
  async kind => {
    post.mockRejectedValueOnce(new CreateBookingError(kind));
    await mount();
    await select();
    await press('Confirm appointment');
    expect(ref.getCurrentRoute()?.name).toBe('BookAppointment');
    expect(hasText(bookingMessages[kind])).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(action('Confirm appointment').props.disabled).toBe(true);
  },
);
test('duplicate booking is not treated as a new success and offers My bookings', async () => {
  post.mockRejectedValueOnce(new CreateBookingError('duplicate'));
  await mount();
  await select();
  await press('Confirm appointment');
  expect(hasText(bookingMessages.duplicate)).toBe(true);
  expect(action('Confirm appointment').props.disabled).toBe(true);
  await press('Confirm appointment');
  expect(post).toHaveBeenCalledTimes(1);
  await press('Check My bookings');
  expect(ref.getCurrentRoute()?.name).toBe('MyBookings');
});
test('uncertain response requires an explicit retry of the same session', async () => {
  post.mockRejectedValueOnce(new CreateBookingError('uncertain'));
  await mount();
  await select();
  await press('Confirm appointment');
  expect(hasText(bookingMessages.uncertain)).toBe(true);
  expect(action('Confirm appointment').props.disabled).toBe(true);
  await press('Confirm appointment');
  expect(post).toHaveBeenCalledTimes(1);
  await press('Retry same session');
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls.map(([request]) => request.sessionId)).toEqual([
    session._id,
    session._id,
  ]);
  expect(ref.getCurrentRoute()?.name).toBe('BookingConfirmation');
});
test.each(['authentication', 'forbidden'] as BookingErrorKind[])(
  '%s blocks the rejected token, keeps errors local, and supports reauthentication',
  async kind => {
    post.mockRejectedValueOnce(new CreateBookingError(kind));
    await mount();
    await select();
    await press('Confirm appointment');
    expect(hasText(bookingMessages[kind])).toBe(true);
    expect(action('Confirm appointment').props.disabled).toBe(true);
    await press('Sign in again');
    expect(expired).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  },
);
test('service failure permits a deliberate retry without automatic submission', async () => {
  post.mockRejectedValueOnce(new CreateBookingError('service'));
  await mount();
  await select();
  await press('Confirm appointment');
  expect(hasText(bookingMessages.service)).toBe(true);
  expect(post).toHaveBeenCalledTimes(1);
  await press('Confirm appointment');
  expect(ref.getCurrentRoute()?.name).toBe('BookingConfirmation');
});
test('late success while on another tab is retained without stealing navigation or posting again', async () => {
  const pending = deferred();
  post.mockReturnValueOnce(pending.promise);
  await mount();
  await select();
  await press('Confirm appointment');
  await act(async () => {
    ref.navigate('PatientApp', { screen: 'Bookings' });
    pending.resolve(saved);
  });
  expect(ref.getCurrentRoute()?.name).toBe('MyBookings');
  await act(async () => {
    ref.navigate('PatientApp', { screen: 'Home' });
  });
  expect(hasText('Appointment saved')).toBe(true);
  await press('View confirmation');
  expect(ref.getCurrentRoute()).toMatchObject({
    name: 'BookingConfirmation',
    params: { bookingId: saved.id },
  });
  expect(post).toHaveBeenCalledTimes(1);
});
test('an uncertain result survives returning to the booking screen', async () => {
  post.mockRejectedValueOnce(new CreateBookingError('uncertain'));
  await mount();
  await select();
  await press('Confirm appointment');
  await press('Check My bookings');
  await act(async () => {
    ref.navigate('PatientApp', { screen: 'Home' });
  });
  expect(hasText(bookingMessages.uncertain)).toBe(true);
  await select();
  expect(action('Confirm appointment').props.disabled).toBe(true);
  expect(post).toHaveBeenCalledTimes(1);
});
test('a session that has started cannot POST even before the next timer tick', async () => {
  await mount();
  await select();
  jest.setSystemTime(new Date(session.startsAt));
  await press('Confirm appointment');
  expect(post).not.toHaveBeenCalled();
});
test('sign-out aborts transport and late success cannot navigate into the next account', async () => {
  const pending = deferred();
  post.mockReturnValueOnce(pending.promise);
  await mount();
  await select();
  await press('Confirm appointment');
  const signal = post.mock.calls[0][0].signal;
  await act(async () => {
    renderer.update(tree(null));
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve(saved);
  });
  expect(ref.getCurrentRoute()?.name).toBe('Welcome');
});
test('token replacement cancels old work, retains uncertainty, and ignores its late response', async () => {
  const pending = deferred();
  post.mockReturnValueOnce(pending.promise);
  await mount();
  await select();
  await press('Confirm appointment');
  const signal = post.mock.calls[0][0].signal;
  await act(async () => {
    renderer.update(tree({ ...patient, accessToken: 'new.jwt.token' }));
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve(saved);
  });
  expect(ref.getCurrentRoute()?.name).toBe('BookAppointment');
  expect(hasText(bookingMessages.uncertain)).toBe(true);
});

test('switching directly to another patient clears booking history and ignores the first account’s late success', async () => {
  const pending = deferred();
  post.mockReturnValueOnce(pending.promise);
  await mount();
  await select();
  await press('Confirm appointment');
  const signal = post.mock.calls[0][0].signal;
  await act(async () => {
    renderer.update(
      tree({
        userId: 'abcdef000000000000000002',
        role: 'PATIENT',
        accessToken: 'other.patient.token',
        patient: { fullName: 'Second Test Patient' },
      }),
    );
  });
  expect(signal.aborted).toBe(true);
  expect(ref.getCurrentRoute()?.name).toBe('PatientHome');
  await act(async () => {
    pending.resolve(saved);
  });
  expect(ref.getCurrentRoute()?.name).toBe('PatientHome');
  expect(hasText(saved.bookingCode)).toBe(false);
  expect(getBookingDetails).not.toHaveBeenCalled();
  await act(async () => {
    ref.navigate('PatientApp', {
      screen: 'Home',
      params: { screen: 'BookAppointment', params: { hospitalId, serviceId } },
    });
  });
  await select();
  expect(action('Confirm appointment').props.disabled).toBe(false);
  expect(hasText('Appointment saved')).toBe(false);
  expect(post).toHaveBeenCalledTimes(1);
});

test.each(['authentication', 'forbidden'] as BookingErrorKind[])(
  'a newly supplied token can recover after %s without automatic resubmission',
  async kind => {
    post.mockRejectedValueOnce(new CreateBookingError(kind));
    await mount();
    await select();
    await press('Confirm appointment');
    await act(async () => {
      renderer.update(tree({ ...patient, accessToken: 'refreshed.jwt.token' }));
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(action('Confirm appointment').props.disabled).toBe(false);
    await press('Confirm appointment');
    expect(post.mock.calls[1][0].accessToken).toBe('refreshed.jwt.token');
    expect(ref.getCurrentRoute()?.name).toBe('BookingConfirmation');
  },
);
