import {
  AppointmentLoadError,
  getNextAppointment,
  parseNextAppointment,
} from '../src/features/home/nextAppointment';

const booking = {
  _id: 'booking-1',
  bookingCode: 'OPD-101',
  status: 'CONFIRMED',
  hospitalName: 'Test Hospital',
  serviceName: 'General OPD',
  startsAt: '2026-10-04T09:00:00+05:30',
};
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const fetchMock = jest.fn();
beforeEach(() => {
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.0.2.1:4000/api/v1/';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = originalUrl;
  jest.useRealTimers();
});

test('requests the earliest upcoming booking with the JWT and maps the response', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [booking] }),
  });
  const result = await getNextAppointment(
    'test-token',
    new AbortController().signal,
  );
  expect(fetchMock).toHaveBeenCalledWith(
    'http://192.0.2.1:4000/api/v1/bookings/me?status=upcoming&limit=1',
    expect.objectContaining({
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-token',
      },
    }),
  );
  expect(result).toEqual({
    bookingId: 'booking-1',
    bookingCode: 'OPD-101',
    hospitalName: 'Test Hospital',
    serviceName: 'General OPD',
    startsAt: booking.startsAt,
  });
});

test('only a successful empty list represents no upcoming appointments', () => {
  expect(parseNextAppointment({ success: true, data: [] })).toBeNull();
});

test.each([
  null,
  { success: false, data: [] },
  { success: true, data: {} },
  { success: true, data: [booking, booking] },
  { success: true, data: [{ ...booking, status: 'CANCELLED' }] },
  { success: true, data: [{ ...booking, _id: '' }] },
  { success: true, data: [{ ...booking, hospitalName: null }] },
  { success: true, data: [{ ...booking, startsAt: '2026-10-04T09:00:00' }] },
  { success: true, data: [{ ...booking, startsAt: 'invalidZ' }] },
])(
  'rejects malformed or unexpected data instead of displaying a fake empty state (%#)',
  payload => {
    expect(() => parseNextAppointment(payload)).toThrow(AppointmentLoadError);
  },
);

test('does not request private data without a token', async () => {
  await expect(
    getNextAppointment(undefined, new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'authentication' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('does not send a token when the API URL has not been configured', async () => {
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  await expect(
    getNextAppointment('test-token', new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'configuration' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([401, 403])(
  'handles an HTTP %s as an authentication error',
  async status => {
    fetchMock.mockResolvedValue({ ok: false, status });
    await expect(
      getNextAppointment('test-token', new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'authentication' });
  },
);

test('does not treat server failures or invalid JSON as no appointments', async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: false, status: 500 })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not JSON');
      },
    });
  await expect(
    getNextAppointment('test-token', new AbortController().signal),
  ).rejects.toThrow(AppointmentLoadError);
  await expect(
    getNextAppointment('test-token', new AbortController().signal),
  ).rejects.toThrow(AppointmentLoadError);
});

test('times out slow requests and cancels the underlying fetch', async () => {
  jest.useFakeTimers();
  let requestSignal: AbortSignal;
  fetchMock.mockImplementation((_url, options) => {
    requestSignal = options.signal;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () =>
        reject(new Error('aborted')),
      ),
    );
  });
  const result = expect(
    getNextAppointment('test-token', new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'network' });
  await jest.advanceTimersByTimeAsync(15000);
  await result;
  expect(requestSignal!.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('propagates screen cancellation to the underlying request', async () => {
  let requestSignal: AbortSignal;
  fetchMock.mockImplementation((_url, options) => {
    requestSignal = options.signal;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener('abort', () =>
        reject(new Error('aborted')),
      ),
    );
  });
  const controller = new AbortController();
  const result = expect(
    getNextAppointment('test-token', controller.signal),
  ).rejects.toThrow(AppointmentLoadError);
  controller.abort();
  await result;
  expect(requestSignal!.aborted).toBe(true);
});
