import React from 'react';
import { RefreshControl, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';
import type { RootStackParams } from '../src/navigation/types';
import {
  getHospitalDetails,
  getHospitalServices,
  HospitalDetailsError,
  type HospitalDetails,
} from '../src/features/hospitals/hospitalDetails';
import { getAvailableSessions } from '../src/features/booking/availableSessions';
import { ActionButton } from '../src/components/ActionButton';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/features/hospitals/hospitalDetails', () => ({
  ...jest.requireActual('../src/features/hospitals/hospitalDetails'),
  getHospitalDetails: jest.fn(),
  getHospitalServices: jest.fn(),
}));
jest.mock('../src/features/booking/availableSessions', () => ({
  ...jest.requireActual('../src/features/booking/availableSessions'),
  getAvailableSessions: jest.fn(),
}));
const details = jest.mocked(getHospitalDetails);
const services = jest.mocked(getHospitalServices);
const hospital: HospitalDetails = {
  id: '000000000000000000000101',
  name: 'Demo Central Hospital',
  address: 'Demo address',
  city: 'Colombo',
  phone: 'Test phone',
};
const catalog = [
  {
    id: '000000000000000000000201',
    hospitalId: hospital.id,
    name: 'General OPD',
  },
  {
    id: '000000000000000000000202',
    hospitalId: hospital.id,
    name: 'Medical clinic',
  },
];
let renderer: ReactTestRenderer.ReactTestRenderer;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
function button(label: string) {
  const node = renderer.root
    .findAll(
      item =>
        item.props.accessibilityLabel === label &&
        typeof item.props.onPress === 'function',
    )
    .pop();
  expect(node).toBeDefined();
  return node!;
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
  });
}
function hasText(value: string) {
  return renderer.root
    .findAllByType(Text)
    .some(item => item.props.children === value);
}
function cta() {
  return renderer.root
    .findAllByType(ActionButton)
    .find(item => item.props.label === 'View OPD sessions');
}
async function mount(patient = false) {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider>
        <AppNavigator
          navigationRef={ref}
          session={patient ? { userId: 'patient-1', role: 'PATIENT' } : null}
        />
      </SafeAreaProvider>,
    );
  });
  await act(async () => {
    ref.navigate(patient ? 'PatientApp' : 'Guest', {
      screen: 'Home',
      params: {
        screen: 'HospitalDetails',
        params: { hospitalId: hospital.id },
      },
    });
  });
}
function deferred() {
  let resolve!: (value: HospitalDetails) => void;
  const promise = new Promise<HospitalDetails>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.mocked(getAvailableSessions).mockResolvedValue([]);
  details.mockReset();
  services.mockReset();
  details.mockResolvedValue(hospital);
  services.mockResolvedValue(catalog);
});
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
});

test.each([false, true])(
  'guest/patient (%s) sees real details and one selected service is passed to the next route',
  async patient => {
    await mount(patient);
    expect(details).toHaveBeenLastCalledWith(hospital.id, expect.anything());
    expect(services).toHaveBeenLastCalledWith(hospital.id, expect.anything());
    expect(hasText(hospital.name)).toBe(true);
    expect(hasText(hospital.address)).toBe(true);
    expect(
      hasText(
        'Opening hours haven’t been provided. Please confirm with the hospital before your visit.',
      ),
    ).toBe(true);
    expect(cta()?.props.disabled).toBe(true);
    expect(button('View OPD sessions').props.accessibilityState.disabled).toBe(
      true,
    );
    await act(async () => {
      cta()!.props.onPress();
    });
    expect(ref.getCurrentRoute()?.name).toBe('HospitalDetails');
    await press('General OPD');
    await press('Medical clinic');
    expect(button('General OPD').props.accessibilityState.checked).toBe(false);
    expect(button('Medical clinic').props.accessibilityState.checked).toBe(
      true,
    );
    expect(cta()?.props.disabled).toBe(false);
    await press('View OPD sessions');
    expect(ref.getCurrentRoute()).toMatchObject({
      name: 'BookAppointment',
      params: { hospitalId: hospital.id, serviceId: catalog[1].id },
    });
    if (!patient) {
      await press('Patient sign in');
      expect(ref.getCurrentRoute()?.name).toBe('PatientSignIn');
    } else expect(hasText('Choose a session')).toBe(true);
  },
);
test('loading hides actions until both endpoints settle', async () => {
  const pending = deferred();
  details.mockReturnValueOnce(pending.promise);
  await mount();
  expect(hasText('Loading hospital details…')).toBe(true);
  expect(cta()).toBeUndefined();
  await act(async () => {
    pending.resolve(hospital);
  });
  expect(hasText(hospital.name)).toBe(true);
});
test('empty services disable the next step and offer hospital search', async () => {
  services.mockResolvedValue([]);
  await mount();
  expect(hasText('No OPD services listed yet.')).toBe(true);
  expect(cta()?.props.disabled).toBe(true);
  await press('Search hospitals');
  expect(ref.getCurrentRoute()?.name).toBe('HospitalSearch');
});
test('partial service failure retains details, offers retry, and never looks empty', async () => {
  services.mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect(hasText(hospital.name)).toBe(true);
  expect(hasText('We couldn’t load OPD services.')).toBe(true);
  expect(hasText('No OPD services listed yet.')).toBe(false);
  expect(cta()?.props.disabled).toBe(true);
  await press('Retry services');
  expect(hasText('General OPD')).toBe(true);
  expect(details).toHaveBeenCalledTimes(2);
});
test('hospital failure offers retry without rendering unrelated services', async () => {
  details.mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect(hasText('We couldn’t load this hospital')).toBe(true);
  expect(hasText('General OPD')).toBe(false);
  await press('Try again');
  expect(hasText(hospital.name)).toBe(true);
});
test.each(['details', 'services'])(
  '404 from %s makes the whole hospital unavailable',
  async source => {
    (source === 'details' ? details : services).mockRejectedValueOnce(
      new HospitalDetailsError('unavailable'),
    );
    await mount();
    expect(hasText('Hospital unavailable')).toBe(true);
    expect(cta()).toBeUndefined();
    await press('Search hospitals');
    expect(ref.getCurrentRoute()?.name).toBe('HospitalSearch');
  },
);
test('refresh clears selection and cannot continue with a removed service', async () => {
  services.mockResolvedValueOnce(catalog).mockResolvedValueOnce([catalog[1]]);
  await mount();
  await press('General OPD');
  await act(async () => {
    renderer.root.findByType(RefreshControl).props.onRefresh();
  });
  expect(hasText('General OPD')).toBe(false);
  expect(cta()?.props.disabled).toBe(true);
});
test('hospital ID changes cancel both requests and ignore late responses', async () => {
  const old = deferred();
  details.mockReturnValueOnce(old.promise).mockResolvedValueOnce({
    ...hospital,
    id: '000000000000000000000102',
    name: 'New Hospital',
  });
  services.mockResolvedValueOnce(catalog).mockResolvedValueOnce([]);
  await mount();
  const oldSignal = details.mock.calls[0][1];
  await act(async () => {
    ref.navigate('Guest', {
      screen: 'Home',
      params: {
        screen: 'HospitalDetails',
        params: { hospitalId: '000000000000000000000102' },
      },
    });
  });
  expect(oldSignal.aborted).toBe(true);
  expect(services.mock.calls[0][1].aborted).toBe(true);
  await act(async () => {
    old.resolve(hospital);
  });
  expect(hasText('New Hospital')).toBe(true);
  expect(hasText(hospital.name)).toBe(false);
});
test('blur cancels requests and returning refreshes hospital details', async () => {
  await mount();
  const signal = details.mock.calls[0][1];
  await act(async () => {
    ref.navigate('Guest', { screen: 'Bookings' });
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    ref.navigate('Guest', { screen: 'Home' });
  });
  expect(details).toHaveBeenCalledTimes(2);
  expect(services).toHaveBeenCalledTimes(2);
});
