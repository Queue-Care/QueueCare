import React from 'react';
import { RefreshControl, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { PatientPage } from '../src/components/PatientPage';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('pull-to-refresh is offered only when a page supplies onRefresh', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <PatientPage>
        <Text>Static page</Text>
      </PatientPage>,
    );
  });
  expect(renderer.root.findAllByType(RefreshControl)).toHaveLength(0);

  const onRefresh = jest.fn();
  await act(async () => {
    renderer.update(
      <PatientPage refreshing onRefresh={onRefresh}>
        <Text>Refreshable page</Text>
      </PatientPage>,
    );
  });
  const control = renderer.root.findByType(RefreshControl);
  expect(control.props.refreshing).toBe(true);
  await act(async () => {
    control.props.onRefresh();
  });
  expect(onRefresh).toHaveBeenCalledTimes(1);
  await act(async () => {
    renderer.unmount();
  });
});
