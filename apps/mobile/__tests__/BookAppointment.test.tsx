import React from 'react';
import {
  AppState,
  Platform,
  RefreshControl,
  Text,
  type AppStateStatus,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';
import type {
  NavigationSession,
  RootStackParams,
} from '../src/navigation/types';
import {
  AvailableSessionsError,
  getAvailableSessions,
  parseAvailableSessions,
  type AvailableSession,
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
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));
jest.mock('../src/features/hospitals/hospitalDetails', () => ({
  ...jest.requireActual('../src/features/hospitals/hospitalDetails'),
  getHospitalDetails: jest.fn(),
}));
jest.mock('../src/features/booking/availableSessions', () => ({
  ...jest.requireActual('../src/features/booking/availableSessions'),
  getAvailableSessions: jest.fn(),
}));
const load = jest.mocked(getAvailableSessions);
const details = jest.mocked(getHospitalDetails);
const patient: NavigationSession = {
  userId: 'patient-1',
  role: 'PATIENT',
  patient: { fullName: 'Test Patient', nic: '123456789V' },
};
const slots = parseAvailableSessions(
  envelope([
    session,
    {
      ...session,
      _id: 'abcdef000000000000000302',
      startTime: '11:00',
      endTime: '12:00',
      startsAt: `${date}T05:30:00.000Z`,
      endsAt: `${date}T06:30:00.000Z`,
      bookedCount: 17,
      remainingCapacity: 3,
    },
    {
      ...session,
      _id: 'abcdef000000000000000303',
      bookedCount: 20,
      remainingCapacity: 0,
      isBookable: false,
    },
  ]),
  { hospitalId, serviceId, date },
);
let renderer: ReactTestRenderer.ReactTestRenderer;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
let onAppState: (state: AppStateStatus) => void;
let removeListener: jest.Mock;
function screen() {
  return renderer.root.findByType(BookAppointmentScreen);
}
function text(value: string) {
  return screen()
    .findAllByType(Text)
    .some(node => node.props.children === value);
}
function radios() {
  return screen().findAll(
    node =>
      node.props.accessibilityRole === 'radio' &&
      typeof node.props.onPress === 'function' &&
      typeof node.type !== 'string',
  );
}
function action(label: string) {
  return screen()
    .findAllByType(ActionButton)
    .find(node => node.props.label === label)!;
}
async function press(label: string) {
  await act(async () => {
    action(label).props.onPress();
  });
}
async function select(index: number) {
  await act(async () => {
    radios()[index].props.onPress();
  });
}
function dateControl() {
  return screen().find(
    node =>
      node.props.accessibilityLabel === 'Appointment date' &&
      typeof node.props.onPress === 'function',
  );
}
async function changeDate(value: string) {
  await act(async () => {
    dateControl().props.onPress();
  });
  await act(async () => {
    screen()
      .findByType(DateTimePicker)
      .props.onValueChange({}, new Date(`${value}T12:00:00+05:30`));
  });
  await press('Use date');
}
function tree(auth: NavigationSession | null = patient) {
  return (
    <SafeAreaProvider>
      <AppNavigator navigationRef={ref} session={auth} />
    </SafeAreaProvider>
  );
}
async function navigate(
  params: { hospitalId: string; serviceId?: string },
  guest = false,
) {
  await act(async () => {
    ref.navigate(guest ? 'Guest' : 'PatientApp', {
      screen: 'Home',
      params: { screen: 'BookAppointment', params },
    });
  });
}
async function mount(
  auth: NavigationSession | null = patient,
  service: string | undefined = serviceId,
) {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(tree(auth));
  });
  await navigate({ hospitalId, serviceId: service }, auth === null);
}
function deferred() {
  let resolve!: (sessions: AvailableSession[]) => void;
  const promise = new Promise<AvailableSession[]>(done => {
    resolve = done;
  });
  return { resolve, promise };
}
beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-03T02:00:00Z') });
  load.mockReset();
  details.mockReset();
  load.mockResolvedValue(slots);
  details.mockResolvedValue(hospital);
  removeListener = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      onAppState = listener;
      return { remove: removeListener };
    });
});
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test('shows capacity and masked patient summary; selects exactly one available session', async () => {
  await mount();
  expect(load).toHaveBeenLastCalledWith(
    { hospitalId, serviceId, date },
    expect.anything(),
  );
  expect(text(hospital.name)).toBe(true);
  expect(text('12 slots left')).toBe(true);
  expect(text('3 slots left')).toBe(true);
  expect(text('Test Patient')).toBe(true);
  expect(JSON.stringify(screen().props.patient)).toContain('123456789V');
  const renderedText = screen()
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join(' ');
  expect(renderedText).toContain('789V');
  expect(renderedText).not.toContain('123456789V');
  expect(radios()).toHaveLength(3);
  expect(
    radios().every(node => node.props.accessibilityState.checked === false),
  ).toBe(true);
  await select(0);
  await select(2);
  expect(radios().map(node => node.props.accessibilityState.checked)).toEqual([
    false,
    false,
    true,
  ]);
  expect(radios()[1].props.accessibilityState.disabled).toBe(true);
  await select(1);
  expect(radios()[2].props.accessibilityState.checked).toBe(true);
  expect(text('Selected session')).toBe(true);
  expect(action('Confirm appointment').props.disabled).toBe(true);
  await press('Confirm appointment');
  expect(ref.getCurrentRoute()?.name).toBe('BookAppointment');
});
test('missing profile has an honest fallback and never renders invented patient details', async () => {
  await mount({ userId: 'patient-1', role: 'PATIENT' });
  expect(
    text(
      'Patient details are unavailable. Your profile must be loaded before confirming an appointment.',
    ),
  ).toBe(true);
  expect(text('Test Patient')).toBe(false);
});
test('guest direct navigation keeps sign-in gate and never loads availability', async () => {
  await mount(null);
  expect(renderer.root.findAllByType(BookAppointmentScreen)).toHaveLength(0);
  expect(load).not.toHaveBeenCalled();
});
test('loading is explicit, past dates do not fetch, and changing date clears selection', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise);
  await mount();
  expect(text('Loading sessions…')).toBe(true);
  await act(async () => {
    pending.resolve(slots);
  });
  await select(0);
  await act(async () => {
    dateControl().props.onPress();
  });
  const calendar = screen().findByType(DateTimePicker).props;
  expect(calendar.mode).toBe('date');
  expect(calendar.minimumDate.toISOString()).toBe(
    new Date(`${date}T00:00:00+05:30`).toISOString(),
  );
  await press('Cancel');
  expect(screen().findAllByType(DateTimePicker)).toHaveLength(0);
  await changeDate('2026-10-02');
  expect(text('Choose today or a future date.')).toBe(true);
  expect(load).toHaveBeenCalledTimes(1);
  load.mockResolvedValue([]);
  await changeDate('2026-10-04');
  expect(load).toHaveBeenLastCalledWith(
    { hospitalId, serviceId, date: '2026-10-04' },
    expect.anything(),
  );
  expect(text('Selected session')).toBe(false);
  expect(text('No upcoming sessions for this date')).toBe(true);
  await changeDate(date);
  expect(dateControl().props.accessibilityValue).toEqual({
    text: 'Sat, 3 Oct 2026',
  });
});
test('Android calendar applies a chosen date immediately and dismissing keeps the date', async () => {
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  try {
    await mount();
    load.mockResolvedValue([]);
    await act(async () => {
      dateControl().props.onPress();
    });
    await act(async () => {
      screen().findByType(DateTimePicker).props.onDismiss();
    });
    expect(screen().findAllByType(DateTimePicker)).toHaveLength(0);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      dateControl().props.onPress();
    });
    await act(async () => {
      screen()
        .findByType(DateTimePicker)
        .props.onValueChange({}, new Date('2026-10-05T12:00:00+05:30'));
    });
    expect(screen().findAllByType(DateTimePicker)).toHaveLength(0);
    expect(load).toHaveBeenLastCalledWith(
      { hospitalId, serviceId, date: '2026-10-05' },
      expect.anything(),
    );
  } finally {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  }
});
test('refresh invalidates selection and updated capacity disables a now-full session', async () => {
  await mount();
  await select(0);
  load.mockResolvedValue([
    { ...slots[0], remainingCapacity: 0, bookedCount: 20, isBookable: false },
  ]);
  await act(async () => {
    screen().findByType(RefreshControl).props.onRefresh();
  });
  expect(text('Selected session')).toBe(false);
  expect(radios()[0].props.accessibilityState).toEqual({
    checked: false,
    disabled: true,
  });
});
test('network failure is distinct from emptiness and retry recovers', async () => {
  load.mockRejectedValueOnce(new Error('private backend message'));
  await mount();
  expect(text('We couldn’t load sessions')).toBe(true);
  expect(text('No upcoming sessions for this date')).toBe(false);
  expect(text('private backend message')).toBe(false);
  await press('Try again');
  expect(radios()).toHaveLength(3);
});
test('unavailable service offers hospital search', async () => {
  load.mockRejectedValueOnce(new AvailableSessionsError('unavailable'));
  await mount();
  expect(text('Hospital or service unavailable')).toBe(true);
  await press('Choose another hospital');
  expect(ref.getCurrentRoute()?.name).toBe('HospitalSearch');
});
test('date and hospital changes abort old work and ignore late responses', async () => {
  const old = deferred();
  load.mockReturnValueOnce(old.promise);
  await mount();
  const signal = load.mock.calls[0][1];
  load.mockResolvedValue([]);
  await changeDate('2026-10-04');
  expect(signal.aborted).toBe(true);
  await act(async () => {
    old.resolve(slots);
  });
  expect(text('No upcoming sessions for this date')).toBe(true);
  expect(radios()).toHaveLength(0);
  const nextSignal = load.mock.calls[1][1];
  await navigate({ hospitalId: 'abcdef000000000000000102' });
  expect(nextSignal.aborted).toBe(true);
  expect(load).toHaveBeenLastCalledWith(
    { hospitalId: 'abcdef000000000000000102', serviceId: undefined, date },
    expect.anything(),
  );
});
test('focus and foreground refresh availability and discard selections', async () => {
  await mount();
  await select(0);
  const signal = load.mock.calls[0][1];
  await act(async () => {
    ref.navigate('PatientApp', { screen: 'Bookings' });
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    ref.navigate('PatientApp', { screen: 'Home' });
  });
  expect(load).toHaveBeenCalledTimes(2);
  expect(text('Selected session')).toBe(false);
  await select(0);
  await act(async () => {
    onAppState('background');
  });
  expect(load.mock.calls[1][1].aborted).toBe(true);
  await act(async () => {
    onAppState('active');
  });
  expect(load).toHaveBeenCalledTimes(3);
  expect(text('Selected session')).toBe(false);
});
test('a session that starts while visible cannot remain selected', async () => {
  await mount();
  await select(0);
  await act(async () => {
    jest.setSystemTime(new Date(session.startsAt));
    await jest.advanceTimersByTimeAsync(30000);
  });
  expect(text('Selected session')).toBe(false);
  expect(radios()).toHaveLength(1);
  expect(text('3 slots left')).toBe(true);
});
test('unmount cancels pending requests and removes listeners', async () => {
  load.mockReturnValueOnce(deferred().promise);
  await mount();
  const signal = load.mock.calls[0][1];
  await act(async () => {
    renderer.unmount();
  });
  expect(signal.aborted).toBe(true);
  expect(removeListener).toHaveBeenCalled();
});

test('full session is labelled Fully booked and cannot initiate a booking', async () => {
  await mount();
  expect(text('Fully booked')).toBe(true);
  const full = radios()[1];
  expect(full.props.accessibilityState.disabled).toBe(true);
  expect(full.props.disabled).toBe(true);
});
