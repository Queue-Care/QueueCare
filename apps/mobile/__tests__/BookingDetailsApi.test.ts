import {
  getBookingDetails,
  parseBookingDetails,
  BookingDetailsError,
  bookingStatuses,
  sessionStatuses,
} from '../src/features/booking/bookingDetails';
import {
  bookingDetailsPayload,
  patientId,
} from '../test-utils/bookingFixtures';
const bookingId = bookingDetailsPayload.data._id;
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const fetchMock = jest.fn();
const load = (signal = new AbortController().signal) =>
  getBookingDetails(bookingId, patientId, 'test.jwt.token', signal);
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
test('GET uses the saved ID and bearer token, validates ownership, and strips extra fields', async () => {
  fetchMock.mockResolvedValue({
    status: 200,
    json: async () => ({
      ...bookingDetailsPayload,
      data: { ...bookingDetailsPayload.data, private: 'hidden' },
    }),
  });
  const result = await getBookingDetails(
    bookingId.toUpperCase(),
    patientId,
    'test.jwt.token',
    new AbortController().signal,
  );
  expect(result.id).toBe(bookingId);
  expect(result.bookingCode).toBe(bookingDetailsPayload.data.bookingCode);
  expect(result.hospital.name).toBe('Test Hospital');
  expect(result.session.startsAt).toBe('2026-10-03T03:30:00.000Z');
  expect(result).not.toHaveProperty('private');
  expect(result.session).not.toHaveProperty('capacity');
  expect(fetchMock.mock.calls).toEqual([
    [
      `http://192.0.2.1:4000/api/v1/bookings/${bookingId}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer test.jwt.token',
        },
        signal: expect.anything(),
      },
    ],
  ]);
});
test('assigned appointment time and queue type come from the backend', () => {
  const payload = { ...bookingDetailsPayload, data: { ...bookingDetailsPayload.data,
    assignedTime: '2026-10-03T03:55:00.000Z', queueType: 'PRIORITY' } };
  const result = parseBookingDetails(payload, bookingId, patientId);
  expect(result.assignedTime).toBe(payload.data.assignedTime);
  expect(result.queueType).toBe('PRIORITY');
  expect(() => parseBookingDetails({ ...payload, data: { ...payload.data, assignedTime: 'invalid' } }, bookingId, patientId)).toThrow();
});

test('all known saved statuses and inactive parents parse without fabricating confirmation', () => {
  for (const status of bookingStatuses)
    expect(
      parseBookingDetails(
        {
          ...bookingDetailsPayload,
          data: { ...bookingDetailsPayload.data, status },
        },
        bookingId,
        patientId,
      ).status,
    ).toBe(status);
  for (const status of sessionStatuses) {
    const data = {
      ...bookingDetailsPayload.data,
      session: { ...bookingDetailsPayload.data.session, status },
      hospital: { ...bookingDetailsPayload.data.hospital, isActive: false },
    };
    expect(
      parseBookingDetails({ success: true, data }, bookingId, patientId).session
        .status,
    ).toBe(status);
  }
});
test.each([
  { _id: patientId },
  { patientId: bookingId },
  { sessionId: bookingId },
  { status: 'UNKNOWN' },
  { bookingCode: '' },
  { updatedAt: '2026-02-30T02:00:00.000Z' },
  { updatedAt: '2026-10-02T02:00:00.000Z' },
  { hospital: { ...bookingDetailsPayload.data.hospital, _id: bookingId } },
  { service: { ...bookingDetailsPayload.data.service, _id: bookingId } },
  {
    session: {
      ...bookingDetailsPayload.data.session,
      startsAt: '2026-10-03T09:00:00.000Z',
    },
  },
  {
    session: {
      ...bookingDetailsPayload.data.session,
      sessionDate: '2026-02-30',
    },
  },
])(
  'rejects mismatched ownership, references or malformed summaries (%#)',
  change => {
    expect(() =>
      parseBookingDetails(
        { success: true, data: { ...bookingDetailsPayload.data, ...change } },
        bookingId,
        patientId,
      ),
    ).toThrow(BookingDetailsError);
  },
);
test.each([
  [401, 'authentication'],
  [403, 'forbidden'],
  [404, 'unavailable'],
  [409, 'incomplete'],
  [500, 'network'],
  [503, 'network'],
])(
  'HTTP %s is %s without leaking server text or retrying',
  async (status, kind) => {
    fetchMock.mockResolvedValue({
      status,
      json: async () => ({ error: { message: 'private-server-error' } }),
    });
    await expect(load()).rejects.toMatchObject({
      kind,
      message: 'Unable to load booking details',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
test('invalid credentials, IDs, configuration and pre-cancellation do not fetch', async () => {
  const signal = new AbortController().signal;
  for (const accessToken of [undefined, '', 'token\r\nheader'])
    await expect(
      getBookingDetails(bookingId, patientId, accessToken, signal),
    ).rejects.toMatchObject({ kind: 'authentication' });
  await expect(
    getBookingDetails('../bad', patientId, 'jwt', signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  const controller = new AbortController();
  controller.abort();
  await expect(load(controller.signal)).rejects.toMatchObject({
    kind: 'network',
  });
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  await expect(load()).rejects.toMatchObject({ kind: 'configuration' });
  expect(fetchMock).not.toHaveBeenCalled();
});
test.each(['timeout', 'cancel'])(
  '%s aborts the read without retrying',
  async action => {
    jest.useFakeTimers();
    let transportSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, options) => {
      transportSignal = options.signal;
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      );
    });
    const controller = new AbortController();
    const result = expect(load(controller.signal)).rejects.toMatchObject({
      kind: 'network',
    });
    if (action === 'timeout') await jest.advanceTimersByTimeAsync(15000);
    else controller.abort();
    await result;
    expect(transportSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('invalid JSON, unexpected HTTP success and lost transport cannot produce a booking summary', async () => {
  fetchMock
    .mockResolvedValueOnce({
      status: 200,
      json: async () => {
        throw new Error('private-json-error');
      },
    })
    .mockResolvedValueOnce({
      status: 202,
      json: async () => bookingDetailsPayload,
    })
    .mockRejectedValueOnce(new Error('private-connection-error'));
  for (let attempt = 0; attempt < 3; attempt++)
    await expect(load()).rejects.toMatchObject({
      kind: 'network',
      message: 'Unable to load booking details',
    });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
