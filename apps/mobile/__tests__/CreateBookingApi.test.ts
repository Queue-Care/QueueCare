import {
  createBooking,
  CreateBookingError,
  parseCreatedBooking,
} from '../src/features/booking/createBooking';
import { bookingPayload, patientId } from '../test-utils/bookingFixtures';
const sessionId = bookingPayload.data.sessionId;
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const fetchMock = jest.fn();
const request = () => ({
  patientId,
  sessionId,
  accessToken: 'test.jwt.token',
  signal: new AbortController().signal,
});
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
test('POST sends only sessionId and JWT, validates the saved booking and strips internal fields', async () => {
  fetchMock.mockResolvedValue({
    status: 201,
    json: async () => ({
      ...bookingPayload,
      data: { ...bookingPayload.data, private: 'hidden' },
    }),
  });
  const result = await createBooking({
    ...request(),
    sessionId: sessionId.toUpperCase(),
  });
  expect(result).toEqual({
    id: bookingPayload.data._id,
    bookingCode: bookingPayload.data.bookingCode,
    patientId,
    sessionId,
    status: 'CONFIRMED',
    createdAt: bookingPayload.data.createdAt,
    updatedAt: bookingPayload.data.updatedAt,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]).toEqual([
    'http://192.0.2.1:4000/api/v1/bookings',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer test.jwt.token',
      },
      body: JSON.stringify({ sessionId }),
      signal: expect.anything(),
    },
  ]);
});
test.each([
  { _id: 'bad' },
  { patientId: sessionId },
  { sessionId: patientId },
  { bookingCode: '' },
  { status: 'CANCELLED' },
  { createdAt: '2026-10-03T02:00:00' },
  { updatedAt: '2026-02-30T02:00:00.000Z' },
  { updatedAt: '2026-10-02T02:00:00.000Z' },
])(
  'mismatched/malformed success is uncertain, never a fabricated confirmation (%#)',
  change => {
    expect(() =>
      parseCreatedBooking(
        { ...bookingPayload, data: { ...bookingPayload.data, ...change } },
        patientId,
        sessionId,
      ),
    ).toThrow(CreateBookingError);
  },
);
test.each([
  [401, 'UNAUTHORIZED', 'authentication'],
  [403, 'FORBIDDEN', 'forbidden'],
  [409, 'SESSION_FULL', 'full'],
  [409, 'SESSION_UNAVAILABLE', 'unavailable'],
  [404, 'NOT_FOUND', 'unavailable'],
  [409, 'BOOKING_ALREADY_EXISTS', 'duplicate'],
  [400, 'VALIDATION_ERROR', 'validation'],
  [503, 'BOOKING_UNAVAILABLE', 'service'],
  [503, 'SERVICE_UNAVAILABLE', 'service'],
  [500, 'INTERNAL_ERROR', 'uncertain'],
  [409, 'UNKNOWN', 'uncertain'],
  [500, 'SESSION_FULL', 'uncertain'],
])(
  'HTTP %s / %s maps to %s without leaking backend text or retrying',
  async (status, code, kind) => {
    fetchMock.mockResolvedValue({
      status,
      json: async () => ({
        success: false,
        error: { code, message: 'secret-raw-error' },
      }),
    });
    await expect(createBooking(request())).rejects.toMatchObject({
      kind,
      message: 'Unable to confirm appointment',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
test('unexpected statuses, invalid JSON, and network errors are uncertain', async () => {
  fetchMock
    .mockResolvedValueOnce({ status: 200, json: async () => bookingPayload })
    .mockResolvedValueOnce({
      status: 201,
      json: async () => {
        throw new Error('private');
      },
    })
    .mockRejectedValueOnce(new Error('offline'));
  for (let i = 0; i < 3; i++)
    await expect(createBooking(request())).rejects.toMatchObject({
      kind: 'uncertain',
    });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
test('missing credentials, malformed IDs, missing config and pre-cancellation never POST', async () => {
  for (const bad of [
    { accessToken: '' },
    { accessToken: 'token\r\nheader' },
    { patientId: 'bad' },
  ])
    await expect(createBooking({ ...request(), ...bad })).rejects.toMatchObject(
      { kind: 'authentication' },
    );
  await expect(
    createBooking({ ...request(), sessionId: '../invalid' }),
  ).rejects.toMatchObject({ kind: 'validation' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    createBooking({ ...request(), signal: controller.signal }),
  ).rejects.toMatchObject({ kind: 'uncertain' });
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  await expect(createBooking(request())).rejects.toMatchObject({
    kind: 'configuration',
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
test.each(['timeout', 'cancel'])(
  '%s aborts one POST and preserves uncertainty without retrying',
  async action => {
    jest.useFakeTimers();
    let usedSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, options) => {
      usedSignal = options.signal;
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      );
    });
    const controller = new AbortController();
    const result = expect(
      createBooking({ ...request(), signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'uncertain' });
    if (action === 'timeout') await jest.advanceTimersByTimeAsync(15000);
    else controller.abort();
    await result;
    expect(usedSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  },
);
