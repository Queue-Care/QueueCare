import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../src/App';
import { SplashScreen } from '../src/screens/SplashScreen';
import { WelcomeScreen } from '../src/screens/WelcomeScreen';
import { NavigationPage } from '../src/navigation/NavigationPage';
import type { NavigationSession } from '../src/navigation/types';
import type { SessionLoader } from '../src/features/startup/useAppStartup';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

let renderer: ReactTestRenderer.ReactTestRenderer;
function deferredSession() {
  let resolve!: (session: NavigationSession | null) => void;
  const promise = new Promise<NavigationSession | null>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
async function mount(loadSession: SessionLoader) {
  await act(async () => {
    renderer = ReactTestRenderer.create(<App loadSession={loadSession} />);
  });
}
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
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
});

test('keeps Splash visible while the session is loading, then opens Welcome without a delay', async () => {
  const session = deferredSession();
  await mount(() => session.promise);
  expect(renderer.root.findAllByType(SplashScreen)).toHaveLength(1);
  expect(renderer.root.findAllByType(WelcomeScreen)).toHaveLength(0);
  await act(async () => {
    session.resolve(null);
  });
  expect(renderer.root.findAllByType(SplashScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(WelcomeScreen)).toHaveLength(1);
});

test.each([
  ['PATIENT', 'Welcome to QueueCare'],
  ['RECEPTION', 'Reception dashboard'],
  ['NURSE', 'Reception dashboard'],
] as const)(
  'a restored %s session opens the appropriate app',
  async (role, title) => {
    await mount(async () => ({ userId: 'user-1', role }));
    expect(renderer.root.findAllByType(WelcomeScreen)).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType(NavigationPage)
        .some(page => page.props.title === title),
    ).toBe(true);
  },
);

test('a failed session check can be retried successfully', async () => {
  const loadSession = jest
    .fn()
    .mockRejectedValueOnce(new Error('network details must not reach the UI'))
    .mockResolvedValueOnce(null);
  await mount(loadSession);
  expect(renderer.root.findByType(SplashScreen).props.error).toBe(true);
  await press('Try again');
  expect(loadSession).toHaveBeenCalledTimes(2);
  expect(renderer.root.findAllByType(WelcomeScreen)).toHaveLength(1);
});

test('the user can continue signed out after a failed session check', async () => {
  const loadSession = jest.fn().mockRejectedValue(new Error('offline'));
  await mount(loadSession);
  await press('Continue without signing in');
  expect(loadSession).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(WelcomeScreen)).toHaveLength(1);
});

test('an unsupported restored role shows recovery rather than staff access', async () => {
  await mount(
    async () =>
      ({ userId: 'user-1', role: 'ADMIN' } as unknown as NavigationSession),
  );
  expect(renderer.root.findByType(SplashScreen).props.error).toBe(true);
  expect(renderer.root.findAllByType(NavigationPage)).toHaveLength(0);
});

test('synchronous session-loader errors show recovery', async () => {
  await mount(() => {
    throw new Error('storage unavailable');
  });
  expect(renderer.root.findByType(SplashScreen).props.error).toBe(true);
});

test('late results from an obsolete loader cannot replace the current session', async () => {
  const oldSession = deferredSession();
  const newSession = deferredSession();
  await mount(() => oldSession.promise);
  const loadSession = () => newSession.promise;
  await act(async () => {
    renderer.update(<App loadSession={loadSession} />);
  });
  await act(async () => {
    newSession.resolve({ userId: 'patient-1', role: 'PATIENT' });
  });
  await act(async () => {
    oldSession.resolve({ userId: 'staff-1', role: 'RECEPTION' });
  });
  const pages = renderer.root.findAllByType(NavigationPage);
  expect(pages.some(page => page.props.title === 'Welcome to QueueCare')).toBe(
    true,
  );
  expect(pages.some(page => page.props.title === 'Reception dashboard')).toBe(
    false,
  );
});
