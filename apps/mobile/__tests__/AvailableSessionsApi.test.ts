import {
  AvailableSessionsError,
  colomboDate,
  getAvailableSessions,
  isCalendarDate,
  isSessionBookable,
  parseAvailableSessions,
  sessionTimeLabel,
  shiftDate,
} from '../src/features/booking/availableSessions';
import {
  date,
  envelope,
  hospitalId,
  serviceId,
  session,
} from '../test-utils/sessionFixtures';
const query = { hospitalId, serviceId, date };
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
test('Sri Lanka day boundaries, calendar validation, and calendar stepping', () => {
  expect(colomboDate(new Date('2026-12-31T18:29:59Z'))).toBe('2026-12-31');
  expect(colomboDate(new Date('2026-12-31T18:30:00Z'))).toBe('2027-01-01');
  expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
  expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  for (const day of ['2026-02-29', '2026-04-31', '2026-1-01', 'hello'])
    expect(isCalendarDate(day)).toBe(false);
  expect(isCalendarDate('2028-02-29')).toBe(true);
});
test('valid sessions use canonical IDs, Colombo time, and exclusive start cutoff', () => {
  const [result] = parseAvailableSessions(envelope(), query);
  expect(result).toMatchObject({
    id: session._id,
    remainingCapacity: 12,
    isBookable: true,
  });
  expect(sessionTimeLabel(result)).toMatch(/09:00.*10:00/);
  expect(isSessionBookable(result, Date.parse(session.startsAt) - 1)).toBe(
    true,
  );
  expect(isSessionBookable(result, Date.parse(session.startsAt))).toBe(false);
  expect(parseAvailableSessions(envelope([]), query)).toEqual([]);
});
test('full and overfull sessions stay visible but cannot be selected', () => {
  for (const bookedCount of [20, 25]) {
    const [result] = parseAvailableSessions(
      envelope([
        { ...session, bookedCount, remainingCapacity: 0, isBookable: false },
      ]),
      query,
    );
    expect(isSessionBookable(result, 0)).toBe(false);
  }
});
test.each([
  { hospitalId: serviceId },
  { serviceId: hospitalId },
  { _id: 'bad' },
  { serviceName: '' },
  { doctorOrTeam: '' },
  { sessionDate: '2026-10-04' },
  { status: 'CLOSED' },
  { capacity: 0 },
  { capacity: 1.5 },
  { bookedCount: -1 },
  { remainingCapacity: 13 },
  { isBookable: false },
  { startsAt: '2026-10-03T09:00:00.000Z' },
  { startsAt: '2026-10-03T09:00:00' },
  { startTime: '9:00' },
  { endsAt: session.startsAt, endTime: session.startTime },
])('rejects unsafe/mismatched session fields (%#)', change => {
  expect(() =>
    parseAvailableSessions(envelope([{ ...session, ...change }]), query),
  ).toThrow(AvailableSessionsError);
});
test('rejects malformed envelopes, duplicate IDs, and misleading totals or dates', () => {
  for (const payload of [
    null,
    { ...envelope(), success: false },
    { ...envelope(), data: {} },
    envelope([session, session]),
    { ...envelope(), meta: { ...envelope().meta, total: 3 } },
    { ...envelope(), meta: { ...envelope().meta, bookableCount: 0 } },
    { ...envelope(), meta: { ...envelope().meta, date: '2026-10-04' } },
    { ...envelope(), meta: { ...envelope().meta, timeZone: 'UTC' } },
  ]) {
    expect(() => parseAvailableSessions(payload, query)).toThrow(
      AvailableSessionsError,
    );
  }
});
test('GET carries date/service filters without patient data or JWT; all services supported', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => envelope(),
  });
  await getAvailableSessions(
    {
      ...query,
      hospitalId: hospitalId.toUpperCase(),
      serviceId: serviceId.toUpperCase(),
    },
    new AbortController().signal,
  );
  await getAvailableSessions(
    { hospitalId, date },
    new AbortController().signal,
  );
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
    `http://192.0.2.1:4000/api/v1/hospitals/${hospitalId}/sessions?date=${date}&serviceId=${serviceId}`,
    `http://192.0.2.1:4000/api/v1/hospitals/${hospitalId}/sessions?date=${date}`,
  ]);
  expect(fetchMock.mock.calls[0][1].headers).toEqual({
    Accept: 'application/json',
  });
});
test('invalid IDs/dates, absent config, and pre-cancelled requests never fetch', async () => {
  const signal = new AbortController().signal;
  for (const bad of [
    { ...query, hospitalId: '../other' },
    { ...query, serviceId: '' },
  ]) {
    await expect(getAvailableSessions(bad, signal)).rejects.toMatchObject({
      kind: 'unavailable',
    });
  }
  await expect(
    getAvailableSessions({ ...query, date: '2026-02-30' }, signal),
  ).rejects.toMatchObject({ kind: 'validation' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    getAvailableSessions(query, controller.signal),
  ).rejects.toMatchObject({ kind: 'network' });
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  await expect(getAvailableSessions(query, signal)).rejects.toMatchObject({
    kind: 'configuration',
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
test('404 differs from server/JSON failures and never displays backend messages', async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: false, status: 404 })
    .mockResolvedValueOnce({ ok: false, status: 500 })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('secret');
      },
    });
  await expect(
    getAvailableSessions(query, new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(
    getAvailableSessions(query, new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'network' });
  await expect(
    getAvailableSessions(query, new AbortController().signal),
  ).rejects.toThrow('Unable to load OPD sessions');
});
test.each(['timeout', 'cancel'])(
  '%s aborts the request and clears the timer',
  async action => {
    jest.useFakeTimers();
    let fetchSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, options) => {
      fetchSignal = options.signal;
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      );
    });
    const controller = new AbortController();
    const check = expect(
      getAvailableSessions(query, controller.signal),
    ).rejects.toMatchObject({ kind: 'network' });
    if (action === 'timeout') await jest.advanceTimersByTimeAsync(15000);
    else controller.abort();
    await check;
    expect(fetchSignal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  },
);
