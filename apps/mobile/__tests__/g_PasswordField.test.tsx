import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { PasswordField } from '../src/components/g_PasswordField';
import { StaffSignInScreen } from '../src/screens/StaffSignInScreen';
import { StaffRegistrationScreen } from '../src/screens/StaffRegistrationScreen';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

let renderer: ReactTestRenderer.ReactTestRenderer;
async function render(element: React.ReactElement) {
  await act(async () => {
    renderer = ReactTestRenderer.create(element);
  });
}
const input = (label: string) =>
  renderer.root
    .findAllByType(TextInput)
    .find(item => item.props.accessibilityLabel === label)!;
const buttons = (label: string) =>
  renderer.root.findAll(
    item =>
      item.props.accessibilityLabel === label &&
      typeof item.props.onPress === 'function',
  );
async function press(label: string) {
  const button = buttons(label).pop();
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
  });
}
afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
});

test('the eye button shows the password and hides it again', async () => {
  const onChangeText = jest.fn();
  await render(
    <PasswordField
      label="Password"
      value="secret-123"
      onChangeText={onChangeText}
    />,
  );
  // Hidden by default.
  expect(input('Password').props.secureTextEntry).toBe(true);
  expect(buttons('Hide password')).toHaveLength(0);

  await press('Show password');
  expect(input('Password').props.secureTextEntry).toBe(false);
  expect(input('Password').props.value).toBe('secret-123');
  expect(buttons('Show password')).toHaveLength(0);

  await press('Hide password');
  expect(input('Password').props.secureTextEntry).toBe(true);
  // Showing or hiding never changes what was typed.
  expect(onChangeText).not.toHaveBeenCalled();
});

test('staff sign-in and registration both have the eye button', async () => {
  await render(<StaffSignInScreen navigation={{}} route={{}} />);
  expect(input('Password').props.secureTextEntry).toBe(true);
  await press('Show password');
  expect(input('Password').props.secureTextEntry).toBe(false);
  await act(async () => {
    renderer.unmount();
  });

  await render(<StaffRegistrationScreen navigation={{}} />);
  expect(input('Create password').props.secureTextEntry).toBe(true);
  await act(async () => {
    input('Create password').props.onChangeText('abc');
  });
  // Each password box has its own eye button; the first belongs to this one.
  await act(async () => {
    buttons('Show password')[0].props.onPress();
  });
  expect(input('Create password').props.secureTextEntry).toBe(false);
  expect(input('Create password').props.value).toBe('abc');
  expect(input('Confirm password').props.secureTextEntry).toBe(true);
});

describe('confirm password on staff registration', () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const fetchMock = jest.fn();
  const registrations = () =>
    fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/staff/auth/register'),
    );
  const type = async (label: string, text: string) => {
    await act(async () => {
      input(label).props.onChangeText(text);
    });
  };
  const shown = () =>
    renderer.root
      .findAllByType(Text)
      .map(item => [item.props.children].flat(Infinity).join(''));
  async function fillForm() {
    await render(<StaffRegistrationScreen navigation={{}} />);
    await type('Full name', 'Nimasha Fernando');
    await type('Staff ID', 'CNH-RC-0421');
    await type('Hospital', 'Demo Central Hospital');
    await type('Mobile number', '+94 71 998 2210');
    await type('Work email', 'n.fernando@example.org');
    await type('Create password', 'password123');
  }

  beforeEach(() => {
    fetchMock.mockReset();
    // The hospital list is unavailable here, so the form uses the typed name.
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/staff/auth/register')
        ? {
            ok: true,
            status: 201,
            json: async () => ({
              success: true,
              data: {
                user: {
                  userId: 'a'.repeat(24),
                  fullName: 'Nimasha Fernando',
                  staffId: 'CNH-RC-0421',
                  hospital: 'Demo Central Hospital',
                  role: 'RECEPTION',
                },
              },
            }),
          }
        : { ok: false, status: 503, json: async () => ({ success: false }) },
    );
    globalThis.fetch = fetchMock;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.test/api/v1';
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
  });

  test('an empty or different confirmation stops the account being created', async () => {
    await fillForm();
    await press('Create staff account');
    expect(shown()).toContain('Enter your password again.');
    expect(registrations()).toHaveLength(0);

    await type('Confirm password', 'password124');
    await press('Create staff account');
    expect(shown()).toContain('The passwords do not match.');
    expect(registrations()).toHaveLength(0);

    // Correcting either box clears the message.
    await type('Create password', 'password124');
    expect(shown()).not.toContain('The passwords do not match.');
  });

  test('matching passwords create the account and send the password once', async () => {
    await fillForm();
    await type('Confirm password', 'password123');
    await press('Create staff account');
    expect(shown()).not.toContain('The passwords do not match.');
    expect(registrations()).toHaveLength(1);
    const body = JSON.parse(registrations()[0][1].body);
    expect(body.password).toBe('password123');
    // The confirmation is only checked on the phone and is never sent.
    expect(body).not.toHaveProperty('confirmPassword');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Account created',
      expect.any(String),
      expect.any(Array),
    );
  });
});
