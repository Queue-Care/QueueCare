import React from 'react';
import {
  AccessibilityInfo,
  AppState,
  Platform,
  StyleSheet,
  Text,
} from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusText } from '../src/components/StatusText';
import { ActionButton } from '../src/components/ActionButton';
import { colors } from '../src/theme/tokens';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
type Routes = { Status: undefined; Other: undefined };
const Stack = createNativeStackNavigator<Routes>();
let ref: ReturnType<typeof createNavigationContainerRef<Routes>>;
let renderer: ReactTestRenderer.ReactTestRenderer;
let announce: jest.SpyInstance;
const originalAppState = AppState.currentState;
function tree(message: string) {
  return (
    <SafeAreaProvider>
      <NavigationContainer ref={ref}>
        <Stack.Navigator>
          <Stack.Screen name="Status">
            {() => <StatusText>{message}</StatusText>}
          </Stack.Screen>
          <Stack.Screen name="Other">
            {() => <Text>Other screen</Text>}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
async function mount(message = 'Loading sessions') {
  await act(async () => {
    renderer = ReactTestRenderer.create(tree(message));
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'ios');
  AppState.currentState = 'active';
  announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockClear();
  ref = createNavigationContainerRef<Routes>();
});
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer.unmount();
    });
  AppState.currentState = originalAppState;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test('VoiceOver speaks the final result once when a fast request replaces loading', async () => {
  await mount();
  await act(async () => {
    renderer.update(tree('2 sessions available'));
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(announce.mock.calls).toEqual([['2 sessions available']]);
  await act(async () => {
    renderer.update(tree('2 sessions available'));
    jest.advanceTimersByTime(1000);
  });
  expect(announce).toHaveBeenCalledTimes(1);
});
test('VoiceOver cancels pending speech on blur and announces current status on return', async () => {
  await mount();
  await act(async () => {
    ref.navigate('Other');
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(announce).not.toHaveBeenCalled();
  await act(async () => {
    ref.goBack();
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(announce).toHaveBeenCalledWith('Loading sessions');
});
test('unmount and backgrounding suppress delayed announcements', async () => {
  await mount();
  AppState.currentState = 'background';
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(announce).not.toHaveBeenCalled();
  AppState.currentState = 'active';
  await act(async () => {
    renderer.update(tree('Booking confirmed'));
  });
  await act(async () => {
    renderer.unmount();
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(announce).not.toHaveBeenCalled();
});
test('TalkBack gets a live region without duplicate explicit announcements', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await mount('Booking cancelled');
  const status = renderer.root.findByType(StatusText).findByType(Text);
  expect(status.props.accessibilityLiveRegion).toBe('polite');
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  expect(announce).not.toHaveBeenCalled();
});
test('busy action is disabled and exposes its label, hint and progress state', async () => {
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <ActionButton
        label="Confirming appointment…"
        busy
        accessibilityHint="Saving your appointment"
        onPress={jest.fn()}
      />,
    );
  });
  const button = renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.style === 'function',
  )[0];
  expect(button.props.accessibilityRole).toBe('button');
  expect(button.props.accessibilityLabel).toBe('Confirming appointment…');
  expect(button.props.accessibilityHint).toBe('Saving your appointment');
  expect(button.props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
  expect(button.props.disabled).toBe(true);
  const style = StyleSheet.flatten(button.props.style({ pressed: false }));
  expect(style.minHeight).toBeGreaterThanOrEqual(48);
  expect(style.minWidth).toBeGreaterThanOrEqual(48);
  const text = renderer.root.findByType(Text);
  expect(text.props.allowFontScaling).not.toBe(false);
  expect(text.props.numberOfLines).toBeUndefined();
});
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map(value => {
      const n = parseInt(value, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
test.each([
  'primary',
  'outline',
  'onDark',
  'secondary',
  'urgent',
  'danger',
] as const)(
  '%s button maintains readable text in enabled, pressed and disabled states',
  async variant => {
    for (const disabled of [false, true]) {
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ActionButton
            label="Action"
            variant={variant}
            disabled={disabled}
            onPress={jest.fn()}
          />,
        );
      });
      const button = renderer.root.findAll(
        node =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.style === 'function',
      )[0];
      const label = StyleSheet.flatten(
        renderer.root.findByType(Text).props.style,
      );
      for (const pressed of [false, true]) {
        const style = StyleSheet.flatten(button.props.style({ pressed }));
        expect(
          contrast(label.color, style.backgroundColor),
        ).toBeGreaterThanOrEqual(4.5);
      }
      await act(async () => {
        renderer.unmount();
      });
    }
  },
);
test('input and selection outlines have at least 3:1 contrast against screen and control fills', () => {
  for (const background of [colors.panel, colors.mist, colors.tealTint])
    expect(contrast(colors.controlBorder, background)).toBeGreaterThanOrEqual(
      3,
    );
  expect(contrast(colors.inkSoft, colors.panel)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.panel, colors.tealDark)).toBeGreaterThanOrEqual(4.5);
});
