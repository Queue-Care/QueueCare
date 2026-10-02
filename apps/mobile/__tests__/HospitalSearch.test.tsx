import React from 'react';
import { FlatList, RefreshControl, Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from '../src/navigation/AppNavigator';
import type { RootStackParams } from '../src/navigation/types';
import {
  searchHospitals,
  type HospitalPage,
} from '../src/features/hospitals/hospitalSearch';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/features/hospitals/hospitalSearch', () => ({
  searchHospitals: jest.fn(),
}));
const load = jest.mocked(searchHospitals);
const hospital = {
  id: 'hospital-1',
  name: 'Demo Central Hospital',
  city: 'Colombo',
  address: 'Demo address',
};
const page: HospitalPage = {
  hospitals: [hospital],
  page: 1,
  total: 1,
  hasNextPage: false,
};
const empty: HospitalPage = {
  hospitals: [],
  page: 1,
  total: 0,
  hasNextPage: false,
};
let renderer: ReactTestRenderer.ReactTestRenderer;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
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
  if (!patient) await press('Continue as guest');
  await press('Search hospitals');
}
function hasText(value: string) {
  return renderer.root
    .findAllByType(Text)
    .some(node => node.props.children === value);
}
function hospitals() {
  return renderer.root.findByType(FlatList).props.data;
}
async function input(label: string, value: string) {
  await act(async () => {
    renderer.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === label)!
      .props.onChangeText(value);
  });
}
function deferred() {
  let resolve!: (value: HospitalPage) => void;
  const promise = new Promise<HospitalPage>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  load.mockReset();
  load.mockResolvedValue(page);
});
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
});

test.each([false, true])(
  'guest/patient (%s) can browse and select the actual hospital ID',
  async patient => {
    await mount(patient);
    expect(load).toHaveBeenLastCalledWith(
      { search: '', city: '' },
      1,
      expect.anything(),
    );
    expect(hasText('Demo Central Hospital')).toBe(true);
    await press('View Demo Central Hospital, Colombo');
    expect(ref.getCurrentRoute()).toMatchObject({
      name: 'HospitalDetails',
      params: { hospitalId: hospital.id },
    });
    expect(load.mock.calls[0][2].aborted).toBe(true);
  },
);
test('shows loading, then distinguishes empty filtered results from unfiltered emptiness', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise).mockResolvedValue(empty);
  await mount();
  expect(hasText('Loading hospitals…')).toBe(true);
  await act(async () => {
    pending.resolve(empty);
  });
  expect(hasText('No hospitals available yet')).toBe(true);
  await input('Hospital name or city', ' Missing ');
  await input('City filter', ' Kandy ');
  expect(load).toHaveBeenCalledTimes(1);
  await press('Find hospitals');
  expect(load).toHaveBeenLastCalledWith(
    { search: 'Missing', city: 'Kandy' },
    1,
    expect.anything(),
  );
  expect(hasText('No hospitals match your search')).toBe(true);
  await press('Clear filters');
  expect(load).toHaveBeenLastCalledWith(
    { search: '', city: '' },
    1,
    expect.anything(),
  );
  expect(
    renderer.root.findAllByType(TextInput).map(node => node.props.value),
  ).toEqual(['', '']);
});
test('request failure offers retry and never appears as no hospitals', async () => {
  load.mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect(hasText('We couldn’t load hospitals')).toBe(true);
  expect(hasText('No hospitals available yet')).toBe(false);
  await press('Try again');
  expect(hospitals()).toEqual([hospital]);
});
test('pagination retains results on failure, retries the same page, and avoids duplicate IDs', async () => {
  const second = {
    ...hospital,
    id: 'hospital-2',
    name: 'Demo Lakeside Hospital',
  };
  load
    .mockResolvedValueOnce({ ...page, total: 21, hasNextPage: true })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      hospitals: [hospital, second],
      page: 2,
      total: 21,
      hasNextPage: false,
    });
  await mount();
  await press('Load more hospitals');
  expect(hospitals()).toEqual([hospital]);
  expect(
    hasText('We couldn’t load more hospitals. Your results are still here.'),
  ).toBe(true);
  await press('Retry loading more');
  expect(load.mock.calls.map(call => call[1])).toEqual([1, 2, 2]);
  expect(hospitals()).toEqual([hospital, second]);
  await act(async () => {
    renderer.root.findByType(RefreshControl).props.onRefresh();
  });
  expect(load).toHaveBeenLastCalledWith(
    { search: '', city: '' },
    1,
    expect.anything(),
  );
  expect(hospitals()).toEqual([hospital]);
});
test('new filters cancel old requests and late results cannot overwrite the new search', async () => {
  const old = deferred();
  load.mockReturnValueOnce(old.promise).mockResolvedValueOnce(empty);
  await mount();
  const oldSignal = load.mock.calls[0][2];
  await input('City filter', 'Kandy');
  await press('Find hospitals');
  expect(oldSignal.aborted).toBe(true);
  await act(async () => {
    old.resolve(page);
  });
  expect(hospitals()).toEqual([]);
  expect(hasText('No hospitals match your search')).toBe(true);
});

test('rapid load-more taps issue one request and a new search discards its late page', async () => {
  const pending = deferred();
  load
    .mockResolvedValueOnce({ ...page, total: 21, hasNextPage: true })
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(empty);
  await mount();
  const button = renderer.root
    .findAll(
      node =>
        node.props.accessibilityLabel === 'Load more hospitals' &&
        typeof node.props.onPress === 'function',
    )
    .pop()!;
  await act(async () => {
    button.props.onPress();
    button.props.onPress();
  });
  expect(load).toHaveBeenCalledTimes(2);
  const signal = load.mock.calls[1][2];
  await input('City filter', 'Galle');
  await press('Find hospitals');
  expect(signal.aborted).toBe(true);
  expect(load).toHaveBeenLastCalledWith(
    { search: '', city: 'Galle' },
    1,
    expect.anything(),
  );
  await act(async () => {
    pending.resolve({ ...page, page: 2 });
  });
  expect(hospitals()).toEqual([]);
  await press('Find hospitals');
  expect(load).toHaveBeenCalledTimes(4);
});
test('leaving the screen cancels loading and refocus reloads the applied filters', async () => {
  const pending = deferred();
  load.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(empty);
  await mount();
  const signal = load.mock.calls[0][2];
  await act(async () => {
    ref.navigate('Guest', { screen: 'Bookings' });
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve(page);
  });
  await act(async () => {
    ref.navigate('Guest', { screen: 'Home' });
  });
  expect(load).toHaveBeenCalledTimes(2);
  expect(hospitals()).toEqual([]);
});
