import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';

jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('mounts the QueueCare app entry point', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });

  const labels = renderer!.root.findAllByType(Text);
  expect(
    labels.some(label =>
      Array.isArray(label.props.children) &&
      label.props.children.join('') === 'Book your OPD visit\nwithout the queue',
    ),
  ).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
