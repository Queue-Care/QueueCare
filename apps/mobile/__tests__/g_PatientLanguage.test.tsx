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
import { getNextAppointment } from '../src/features/home/nextAppointment';
import {
  getLanguage,
  setLanguage,
  translate,
  translateText,
} from '../src/i18n/g_language';
import {
  patientTranslations,
  translationPatterns,
} from '../src/i18n/g_patientTranslations';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/features/home/nextAppointment', () => ({
  getNextAppointment: jest.fn(),
}));
const load = jest.mocked(getNextAppointment);

let renderer: ReactTestRenderer.ReactTestRenderer;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
const session = (
  preferredLanguage?: 'en' | 'si' | 'ta',
): NavigationSession => ({
  userId: 'patient-1',
  role: 'PATIENT',
  accessToken: 'test-token',
  patient: { fullName: 'Kasun Perera', preferredLanguage },
});
async function mount(current: NavigationSession | null) {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider>
        <AppNavigator session={current} navigationRef={ref} />
      </SafeAreaProvider>,
    );
  });
  for (let turn = 0; turn < 3; turn += 1) await act(async () => {});
}
const texts = () =>
  renderer.root
    .findAllByType(Text)
    .map(item => [item.props.children].flat(Infinity).join(''));

beforeEach(() => {
  load.mockReset();
  load.mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
});

test('patient screens stay in English unless another language is saved', async () => {
  await mount(session());
  expect(texts()).toEqual(
    expect.arrayContaining([
      'Quick actions',
      'No upcoming appointments',
      'Find a hospital',
      'Bookings',
    ]),
  );
});

test('a patient who saved Tamil sees the patient screens in Tamil', async () => {
  await mount(session('ta'));
  expect(texts()).toEqual(
    expect.arrayContaining([
      'விரைவுச் செயல்கள்',
      'வரவிருக்கும் சந்திப்புகள் இல்லை',
      'மருத்துவமனையைத் தேடு',
      'எனது பதிவுகள்',
      'பதிவுகள்',
      // The patient's own name is not translated.
      'Kasun Perera',
    ]),
  );
  expect(texts()).not.toContain('Quick actions');

  // Another screen in the same flow follows the same language.
  await act(async () => {
    ref.navigate('PatientApp', {
      screen: 'Home',
      params: { screen: 'HospitalSearch' },
    });
  });
  for (let turn = 0; turn < 3; turn += 1) await act(async () => {});
  expect(texts()).toEqual(
    expect.arrayContaining(['மருத்துவமனையைத் தேடு', 'மருத்துவமனைகளைக் கண்டறி']),
  );
});

test('a patient who saved Sinhala sees Sinhala, and signing out returns to English', async () => {
  await mount(session('si'));
  expect(texts()).toEqual(
    expect.arrayContaining(['ඉක්මන් ක්‍රියා', 'ඉදිරි හමුවීම් නැත', 'වෙන්කිරීම්']),
  );
  await act(async () => {
    renderer.unmount();
  });
  expect(getLanguage()).toBe('en');
  // Guests browse in English.
  await mount(null);
  expect(getLanguage()).toBe('en');
});

test('sentences with numbers and names are translated around their values', () => {
  expect(translate('si', '3 slots left')).toBe('ස්ථාන 3 ක් ඉතිරියි');
  expect(translate('ta', '1 slot left')).toBe('1 இடம் மீதம்');
  expect(translate('ta', '12 hospitals found. 10 shown.')).toBe(
    '12 மருத்துவமனைகள் கிடைத்தன. 10 காட்டப்படுகின்றன.',
  );
  expect(translate('si', 'Selected service: General OPD')).toBe(
    'තෝරාගත් සේවාව: General OPD',
  );
  expect(translate('en', '3 slots left')).toBe('3 slots left');
  // Spaces around a label are kept so the value after it still reads correctly.
  expect(translateText('ta', 'Phone: ')).toBe('தொலைபேசி: ');
  expect(translateText('si', 'National Hospital of Sri Lanka')).toBe(
    'National Hospital of Sri Lanka',
  );
  setLanguage('en');

  for (const [english, [sinhala, tamil]] of Object.entries(
    patientTranslations,
  )) {
    expect(english.trim()).toBe(english);
    expect(sinhala.trim()).not.toBe('');
    expect(tamil.trim()).not.toBe('');
  }
  // Every pattern keeps all of its captured values in both languages.
  for (const [pattern, sinhala, tamil] of translationPatterns) {
    const groups = new RegExp(`${pattern.source}|`).exec('')!.length - 1;
    for (let group = 1; group <= groups; group += 1) {
      expect(sinhala).toContain(`$${group}`);
      expect(tamil).toContain(`$${group}`);
    }
  }
});

test('picking a language in the patient profile changes the patient screens', async () => {
  const profile = {
    userId: 'a'.repeat(24),
    role: 'PATIENT',
    fullName: 'Kasun Perera',
    staffId: null,
    hospital: null,
    maskedNic: '········1234',
    phone: '+94771234567',
    email: null,
    preferredLanguage: 'en',
    notificationsEnabled: true,
    profileImageUrl: null,
  };
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.test/api/v1';
  const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/me/preferences'))
      Object.assign(profile, JSON.parse(String(init.body)));
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: profile }),
    };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    await mount(session());
    await act(async () => {
      ref.navigate('PatientApp', { screen: 'Profile' });
    });
    for (let turn = 0; turn < 5; turn += 1) await act(async () => {});
    const press = async (label: string) => {
      const button = renderer.root
        .findAll(
          item =>
            item.props.accessibilityLabel === label &&
            typeof item.props.onPress === 'function',
        )
        .pop();
      expect(button).toBeDefined();
      await act(async () => {
        button!.props.onPress();
      });
      for (let turn = 0; turn < 5; turn += 1) await act(async () => {});
    };
    await press('Language, English');
    await press('தமிழ்');
    expect(getLanguage()).toBe('ta');
    expect(texts()).toEqual(
      expect.arrayContaining(['சுயவிவரம்', 'வெளியேறு', 'பதிவுகள்']),
    );
    await act(async () => {
      ref.navigate('PatientApp', { screen: 'Home' });
    });
    for (let turn = 0; turn < 5; turn += 1) await act(async () => {});
    expect(texts()).toEqual(
      expect.arrayContaining(['விரைவுச் செயல்கள்', 'மருத்துவமனையைத் தேடு']),
    );
    expect(texts()).not.toContain('Quick actions');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
  }
});
