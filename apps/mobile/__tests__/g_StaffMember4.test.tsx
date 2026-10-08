import React from 'react';
import { Alert, Image, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  getLanguage,
  translate,
  translateWhen,
} from '../src/i18n/g_language';
import { translations } from '../src/i18n/g_translations';
import { AppNavigator } from '../src/navigation/AppNavigator';
import type { RootStackParams } from '../src/navigation/types';
import { formatWhen } from '../src/features/notifications/g_notifications';
import { initials } from '../src/features/priority/g_priorityRequests';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));
const pickImage = ImagePicker.launchImageLibraryAsync as jest.Mock;
// Records the edits applied on the phone and returns a small JPEG.
const mockPhotoEdits: unknown[] = [];
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (uri: string) => ({
      resize(size: unknown) {
        mockPhotoEdits.push({ uri, resize: size });
        return this;
      },
      renderAsync: async () => ({
        saveAsync: async (options: unknown) => {
          mockPhotoEdits.push({ save: options });
          return { uri: 'file:///resized.jpg', width: 1000, height: 750 };
        },
      }),
    }),
  },
}));

// Records the files attached to an upload; the native file module is not
// available under Jest.
const mockUploadedFiles: string[] = [];
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(path: string) {
      mockUploadedFiles.push(path);
    }
  },
}));

const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const fetchMock = jest.fn();
let renderer: ReactTestRenderer.ReactTestRenderer;
let ref: ReturnType<typeof createNavigationContainerRef<RootStackParams>>;
let onSignOut: jest.Mock;
let onSessionExpired: jest.Mock;

// A small in-memory stand-in for the staff, notification and profile endpoints.
function fakeApi() {
  const request = {
    _id: 'a'.repeat(24),
    status: 'PENDING',
    reason: 'ELDERLY',
    note: 'Cannot stand for long.',
    decisionNote: null,
    createdAt: '2026-10-05T02:00:00.000Z',
    reviewedAt: null,
    patient: {
      fullName: 'Kasun Perera',
      maskedNic: '········234V',
      phone: '+94 77 000 0001',
    },
    booking: { _id: 'b'.repeat(24), bookingCode: 'OPD-DEMO-1' },
    service: { name: 'General OPD' },
    hospital: { name: 'Demo Central Hospital' },
    session: { startsAt: '2026-10-05T03:30:00.000Z' },
    queuePriority: null,
  };
  const notification = {
    _id: 'c'.repeat(24),
    type: 'SYSTEM',
    title: 'Staff account created',
    message: 'Welcome, Nimasha Fernando.',
    data: {},
    readAt: null as string | null,
    createdAt: '2026-10-05T01:00:00.000Z',
  };
  const profile = {
    userId: 'd'.repeat(24),
    role: 'RECEPTION',
    fullName: 'Nimasha Fernando',
    staffId: 'CNH-RC-0421',
    hospital: 'Demo Central Hospital',
    maskedNic: null,
    phone: '+94 71 998 2210',
    email: 'n.fernando@example.org',
    preferredLanguage: 'en',
    notificationsEnabled: true,
    profileImageUrl: null as string | null,
  };
  const pending = () => (request.status === 'PENDING' ? 1 : 0);
  const routes: Record<string, (body: any) => unknown> = {
    'GET /staff/dashboard': () => ({
      data: {
        staff: { fullName: profile.fullName, hospital: profile.hospital },
        sessionsToday: 1,
        priorityWaiting: pending(),
        patientsCheckedIn: 3,
        nowServing: 'A-014',
        unreadNotifications: notification.readAt ? 0 : 1,
        sessions: [
          {
            _id: 'e'.repeat(24),
            serviceName: 'General OPD',
            startsAt: '2026-10-05T03:30:00.000Z',
            capacity: 20,
            bookedCount: 5,
            label: 'Next',
          },
        ],
      },
    }),
    'GET /staff/priority-requests?status=pending': () => ({
      data: pending() ? [request] : [],
      meta: { pendingCount: pending() },
    }),
    'GET /staff/priority-requests?status=decided': () => ({
      data: pending() ? [] : [request],
      meta: { pendingCount: pending() },
    }),
    [`GET /staff/priority-requests/${request._id}`]: () => ({ data: request }),
    [`PATCH /staff/priority-requests/${request._id}/decision`]: body => {
      request.status = body.decision;
      return { data: request };
    },
    'GET /notifications': () => ({
      data: [notification],
      meta: { unreadCount: notification.readAt ? 0 : 1 },
    }),
    [`PATCH /notifications/${notification._id}/read`]: () => {
      notification.readAt = '2026-10-05T04:00:00.000Z';
      return { data: notification };
    },
    'GET /me': () => ({ data: profile }),
    'PATCH /me/preferences': body => ({ data: Object.assign(profile, body) }),
    'PATCH /me': body => ({ data: Object.assign(profile, body) }),
    'POST /me/profile-image': () => {
      profile.profileImageUrl = `/media/profile-photos/${'a'.repeat(
        24,
      )}-${'f'.repeat(32)}.jpg`;
      return { data: profile };
    },
    'DELETE /me/profile-image': () => {
      profile.profileImageUrl = null;
      return { data: profile };
    },
  };
  fetchMock.mockImplementation(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url.replace(
      'http://api.test/api/v1',
      '',
    )}`;
    const route = routes[key];
    if (!route)
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: { message: key } }),
      };
    const body =
      typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, ...(route(body) as object) }),
    };
  });
}
const calls = (method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      url === `http://api.test/api/v1${path}` &&
      (init?.method ?? 'GET') === method,
  );
const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) await act(async () => {});
};
async function mount(
  accessToken: string | undefined = 'staff.jwt.token',
  preferredLanguage?: 'en' | 'si' | 'ta',
) {
  ref = createNavigationContainerRef<RootStackParams>();
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider>
        <AppNavigator
          navigationRef={ref}
          onSignOut={onSignOut}
          onSessionExpired={onSessionExpired}
          session={{
            userId: 'staff-1',
            role: 'RECEPTION',
            accessToken,
            staff: {
              fullName: 'Nimasha Fernando',
              staffId: 'CNH-RC-0421',
              hospital: 'Demo Central Hospital',
              preferredLanguage,
            },
          }}
        />
      </SafeAreaProvider>,
    );
  });
  await settle();
}
async function press(label: string) {
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
  await settle();
}
const texts = () =>
  renderer.root
    .findAllByType(Text)
    .map(item => [item.props.children].flat(Infinity).join(''));
// Presses a button in the most recent confirmation dialog.
async function choose(alert: jest.SpyInstance, label: string) {
  const buttons = alert.mock.calls.at(-1)?.[2] ?? [];
  await act(async () => {
    buttons.find((button: { text: string }) => button.text === label).onPress();
  });
  await settle();
}

beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://api.test/api/v1';
  onSignOut = jest.fn();
  onSessionExpired = jest.fn();
  fakeApi();
});
afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
  jest.restoreAllMocks();
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
});

test('the reception desk shows live figures and opens priority requests', async () => {
  await mount();
  expect(ref.getCurrentRoute()?.name).toBe('ReceptionDashboard');
  expect(calls('GET', '/staff/dashboard')[0][1].headers.Authorization).toBe(
    'Bearer staff.jwt.token',
  );
  const shown = texts();
  expect(shown).toEqual(
    expect.arrayContaining([
      'Reception desk',
      'Demo Central Hospital',
      'A-014',
      'General OPD',
      '9:00 AM · 5 of 20 booked',
      'Review 1 priority request',
    ]),
  );
  await press('Review priority requests');
  expect(ref.getCurrentRoute()?.name).toBe('PriorityRequests');
  expect(texts()).toEqual(
    expect.arrayContaining([
      'Pending · 1',
      'Kasun Perera',
      'General OPD · 9:00 AM',
      'Elderly patient',
    ]),
  );
});

test('accepting a request saves the decision and moves it to Decided', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount();
  await press('Review priority requests');
  await press('Kasun Perera, Elderly patient, Pending');
  expect(ref.getCurrentRoute()).toMatchObject({
    name: 'PriorityRequestDetails',
    params: { requestId: 'a'.repeat(24) },
  });
  expect(texts()).toEqual(
    expect.arrayContaining([
      'NIC ········234V · +94 77 000 0001',
      'OPD-DEMO-1',
      '5 Oct 2026 · 9:00 AM',
      '"Cannot stand for long."',
    ]),
  );

  await press('Accept request');
  // Nothing is saved until the staff member confirms.
  expect(
    calls('PATCH', `/staff/priority-requests/${'a'.repeat(24)}/decision`),
  ).toHaveLength(0);
  await choose(alert, 'Accept');
  const [[, init]] = calls(
    'PATCH',
    `/staff/priority-requests/${'a'.repeat(24)}/decision`,
  );
  expect(JSON.parse(init.body)).toEqual({ decision: 'ACCEPTED' });
  expect(texts()).toContain('Accepted');
  expect(
    renderer.root.findAll(
      item => item.props.accessibilityLabel === 'Accept request',
    ),
  ).toHaveLength(0);

  await press('Back to priority requests');
  expect(texts()).toContain('Pending · 0');
  expect(texts()).toContain('No priority requests are waiting for review.');
  await press('Decided requests');
  expect(texts()).toEqual(expect.arrayContaining(['Kasun Perera', 'Accepted']));
});

test('notifications open from the dashboard and are marked as read', async () => {
  await mount();
  await press('Notifications, 1 unread');
  expect(ref.getCurrentRoute()?.name).toBe('StaffNotifications');
  expect(texts()).toEqual(
    expect.arrayContaining(['Staff account created', 'New']),
  );
  await press('Staff account created. Welcome, Nimasha Fernando. Unread.');
  expect(calls('PATCH', `/notifications/${'c'.repeat(24)}/read`)).toHaveLength(
    1,
  );
  expect(texts()).not.toContain('New');
});

test('the profile saves contact details and settings, then signs out', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount();
  await act(async () => {
    ref.navigate('StaffApp', { screen: 'Profile' });
  });
  await settle();
  expect(texts()).toEqual(
    expect.arrayContaining([
      'Nimasha Fernando',
      'CNH-RC-0421 · +94 71 998 2210',
      'English',
    ]),
  );

  await press('Notification settings, On');
  expect(JSON.parse(calls('PATCH', '/me/preferences')[0][1].body)).toEqual({
    notificationsEnabled: false,
  });
  expect(texts()).toContain('Off');

  await press('Personal information');
  const phone = renderer.root.find(
    item =>
      item.props.accessibilityLabel === 'Mobile number' &&
      typeof item.props.onChangeText === 'function',
  );
  await act(async () => {
    phone.props.onChangeText('+94 77 123 4567');
  });
  await press('Save changes');
  // Only the changed field is sent.
  expect(JSON.parse(calls('PATCH', '/me')[0][1].body)).toEqual({
    phone: '+94 77 123 4567',
  });
  expect(texts()).toContain('CNH-RC-0421 · +94 77 123 4567');

  await press('Sign out');
  expect(onSignOut).not.toHaveBeenCalled();
  await choose(alert, 'Sign out');
  expect(onSignOut).toHaveBeenCalledTimes(1);
});

test('a staff member adds, sees and removes a profile photo', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  pickImage.mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file:///photo.heic',
        width: 4000,
        height: 3000,
        mimeType: 'image/heic',
        fileName: 'me.heic',
      },
    ],
  });
  mockPhotoEdits.length = 0;
  await mount();
  await act(async () => {
    ref.navigate('StaffApp', { screen: 'Profile' });
  });
  await settle();
  const photos = () =>
    renderer.root.findAllByType(Image).map(item => item.props.source.uri);
  expect(photos()).toEqual([]);

  await press('Add profile photo');
  // The picker's own crop screen is not used; its save button is unreliable.
  expect(pickImage.mock.calls[0][0]).not.toHaveProperty('allowsEditing');
  // A large photo is shrunk to a JPEG on the phone before it is sent.
  expect(mockPhotoEdits).toEqual([
    { uri: 'file:///photo.heic', resize: { width: 1000 } },
    { save: { format: 'jpeg', compress: 0.8 } },
  ]);
  // The chosen photo is only previewed; nothing is stored before Save photo.
  expect(photos()).toEqual(['file:///resized.jpg']);
  expect(calls('POST', '/me/profile-image')).toHaveLength(0);
  await press('Cancel');
  expect(photos()).toEqual([]);
  expect(calls('POST', '/me/profile-image')).toHaveLength(0);

  await press('Add profile photo');
  await press('Save photo');
  // The photo is sent to the API as a multipart "image" field.
  const [[, init]] = calls('POST', '/me/profile-image');
  expect(init.body).toBeInstanceOf(FormData);
  // It is attached as a real file: Expo's fetch refuses a { uri, name, type }
  // description, which showed on the phone as "Could not connect".
  expect(init.body.has('image')).toBe(true);
  expect(mockUploadedFiles).toEqual(['file:///resized.jpg']);
  expect(init.headers['Content-Type']).toBeUndefined();
  expect(init.headers.Authorization).toBe('Bearer staff.jwt.token');
  // The API's relative photo path is shown from the API's own address.
  const saved = `http://api.test/api/v1/media/profile-photos/${'a'.repeat(
    24,
  )}-${'f'.repeat(32)}.jpg`;
  expect(photos()).toEqual([saved]);

  // With a photo set, the same button offers to replace or remove it.
  await press('Change profile photo');
  expect(photos()).toEqual([saved, saved]);
  await press('Choose a new photo');
  expect(photos()).toEqual([saved, 'file:///resized.jpg']);
  await press('Cancel');
  expect(calls('POST', '/me/profile-image')).toHaveLength(1);
  await press('Change profile photo');
  await press('Remove photo');
  expect(calls('DELETE', '/me/profile-image')).toHaveLength(1);
  expect(photos()).toEqual([]);

  // Cancelling the picker uploads nothing and offers nothing to save.
  pickImage.mockResolvedValue({ canceled: true, assets: null });
  await press('Add profile photo');
  expect(calls('POST', '/me/profile-image')).toHaveLength(1);
  expect(
    renderer.root.findAll(
      item => item.props.accessibilityLabel === 'Save photo',
    ),
  ).toHaveLength(0);

  // The Edit profile button opens the same form as Personal information.
  await press('Edit profile');
  expect(
    renderer.root.findAll(
      item =>
        item.props.accessibilityLabel === 'Full name' &&
        typeof item.props.onChangeText === 'function',
    ).length,
  ).toBeGreaterThan(0);
});

test('a rejected token ends the session; a missing one only shows a message', async () => {
  fetchMock.mockImplementation(async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Please sign in again.' },
    }),
  }));
  await mount();
  expect(onSessionExpired).toHaveBeenCalled();
  expect(texts()).toContain('Please sign in again.');

  await act(async () => {
    renderer.unmount();
  });
  onSessionExpired.mockClear();
  fetchMock.mockClear();
  await mount('');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(onSessionExpired).not.toHaveBeenCalled();
  expect(texts()).toContain('Please sign in again to continue.');
});

test('names and times are formatted as in the prototype', () => {
  expect(initials('Kasun Perera')).toBe('KP');
  expect(initials('  ishara  de  silva ')).toBe('IS');
  expect(initials('Amaya')).toBe('AM');
  const now = new Date('2026-10-05T06:00:00.000Z');
  expect(formatWhen('2026-10-05T05:50:00.000Z', now)).toBe('10 minutes ago');
  expect(formatWhen('2026-10-05T02:00:00.000Z', now)).toBe('Today · 7:30 AM');
  expect(formatWhen('2026-10-04T12:48:00.000Z', now)).toBe(
    'Yesterday · 6:18 PM',
  );
  expect(formatWhen('2026-09-20T05:00:00.000Z', now)).toBe('20 Sep');
});

test('choosing Sinhala or Tamil changes the staff screens until sign-out', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await mount();
  await act(async () => {
    ref.navigate('StaffApp', { screen: 'Profile' });
  });
  await settle();
  expect(texts()).toEqual(expect.arrayContaining(['Profile', 'Sign out']));

  await press('Language, English');
  await press('සිංහල');
  expect(JSON.parse(calls('PATCH', '/me/preferences')[0][1].body)).toEqual({
    preferredLanguage: 'si',
  });
  // The profile, its rows and the tab bar change together.
  expect(texts()).toEqual(
    expect.arrayContaining([
      'පැතිකඩ',
      'පෞද්ගලික තොරතුරු',
      'ඉවත් වන්න',
      'මුල් පුවරුව',
      'සැසි',
    ]),
  );
  expect(texts()).not.toContain('Sign out');
  // Names and other saved data are not translated.
  expect(texts()).toContain('Nimasha Fernando');

  await act(async () => {
    ref.navigate('StaffApp', { screen: 'Priority' });
  });
  await settle();
  expect(texts()).toEqual(
    expect.arrayContaining(['ප්‍රමුඛතා ඉල්ලීම්', 'වැඩිහිටි රෝගියෙක්', 'Kasun Perera']),
  );

  await act(async () => {
    ref.navigate('StaffApp', { screen: 'Profile' });
  });
  await settle();
  await press('භාෂාව, සිංහල');
  await press('தமிழ்');
  expect(texts()).toEqual(expect.arrayContaining(['சுயவிவரம்', 'வெளியேறு']));

  // Leaving the staff screens returns the app to English.
  await act(async () => {
    renderer.unmount();
  });
  expect(getLanguage()).toBe('en');
  await mount();
  expect(texts()).toContain('Reception desk');
});

test('staff screens open in the language saved on the account', async () => {
  await mount('staff.jwt.token', 'ta');
  expect(texts()).toEqual(
    expect.arrayContaining(['வரவேற்பு மேசை', 'முகப்பு', 'அமர்வுகள்']),
  );
  expect(texts()).not.toContain('Reception desk');
});

test('translations fill in values and leave unknown text in English', () => {
  expect(translate('en', '{count} waiting', { count: 3 })).toBe('3 waiting');
  expect(translate('si', '{count} waiting', { count: 3 })).toBe(
    'රැඳී සිටින්නන් 3',
  );
  expect(translate('ta', 'Try again')).toBe('மீண்டும் முயற்சிக்கவும்');
  expect(translate('si', 'Colombo General Hospital')).toBe(
    'Colombo General Hospital',
  );
  expect(translateWhen('en', '10 minutes ago')).toBe('10 minutes ago');
  expect(translateWhen('si', '10 minutes ago')).toBe('මිනිත්තු 10 කට පෙර');
  expect(translateWhen('ta', 'Yesterday · 6:18 PM')).toBe('நேற்று · 6:18 PM');
  expect(translateWhen('ta', '20 Sep')).toBe('20 Sep');

  // Every entry has both languages and keeps the same {placeholders}.
  const placeholders = (text: string) =>
    (text.match(/\{[a-z]+\}/g) ?? []).sort().join();
  for (const [english, [sinhala, tamil]] of Object.entries(translations)) {
    expect(sinhala.trim()).not.toBe('');
    expect(tamil.trim()).not.toBe('');
    expect(placeholders(sinhala)).toBe(placeholders(english));
    expect(placeholders(tamil)).toBe(placeholders(english));
  }
});
