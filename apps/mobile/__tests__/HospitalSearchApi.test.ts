import {
  HospitalSearchError,
  parseHospitalPage,
  searchHospitals,
} from '../src/features/hospitals/hospitalSearch';

const hospital = {
  _id: '000000000000000000000101',
  name: 'Demo Central Hospital',
  city: 'Colombo',
  address: 'Demo address',
};
const payload = {
  success: true,
  data: [hospital],
  meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false },
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

test('encodes public search filters and maps real API fields without an auth header', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => payload });
  const result = await searchHospitals(
    { search: ' Clinic [West] & East ', city: ' Colombo ' },
    1,
    new AbortController().signal,
  );
  expect(fetchMock).toHaveBeenCalledWith(
    'http://192.0.2.1:4000/api/v1/hospitals?search=Clinic%20%5BWest%5D%20%26%20East&city=Colombo&page=1&limit=20',
    expect.objectContaining({ headers: { Accept: 'application/json' } }),
  );
  expect(result).toEqual({
    hospitals: [
      {
        id: hospital._id,
        name: hospital.name,
        city: hospital.city,
        address: hospital.address,
      },
    ],
    total: 1,
    page: 1,
    hasNextPage: false,
  });
});
test('a successful empty response is distinct from a failure', () => {
  expect(
    parseHospitalPage(
      {
        success: true,
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      },
      1,
    ).hospitals,
  ).toEqual([]);
});
test.each([
  null,
  { ...payload, success: false },
  { ...payload, data: {} },
  { ...payload, data: [{ ...hospital, name: '' }] },
  { ...payload, data: [{ ...hospital, _id: null }] },
  { ...payload, data: [{ ...hospital, city: 42 }] },
  { ...payload, data: [{ ...hospital, address: undefined }] },
  { ...payload, data: [hospital, hospital] },
  { ...payload, meta: { ...payload.meta, page: 2 } },
  { ...payload, meta: { ...payload.meta, limit: 50 } },
  { ...payload, meta: { ...payload.meta, total: -1 } },
  { ...payload, meta: { ...payload.meta, hasNextPage: true } },
])(
  'rejects invalid data instead of showing invented or empty results (%#)',
  body => {
    expect(() => parseHospitalPage(body, 1)).toThrow(HospitalSearchError);
  },
);
test('requires configuration and does not fetch on an already cancelled request', async () => {
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  await expect(
    searchHospitals({ search: '', city: '' }, 1, new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'configuration' });
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.0.2.1:4000/api/v1';
  const controller = new AbortController();
  controller.abort();
  await expect(
    searchHospitals({ search: '', city: '' }, 1, controller.signal),
  ).rejects.toMatchObject({ kind: 'network' });
  expect(fetchMock).not.toHaveBeenCalled();
});
test('HTTP and invalid JSON failures remain safe errors', async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: false, status: 500 })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('private server message');
      },
    });
  for (let i = 0; i < 2; i++)
    await expect(
      searchHospitals(
        { search: '', city: '' },
        1,
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unable to load hospitals');
});
test.each(['timeout', 'cancel'] as const)(
  '%s aborts the network request and clears its timer',
  async action => {
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
    const controller = new AbortController();
    const result = expect(
      searchHospitals({ search: '', city: '' }, 1, controller.signal),
    ).rejects.toMatchObject({ kind: 'network' });
    if (action === 'timeout') await jest.advanceTimersByTimeAsync(15000);
    else controller.abort();
    await result;
    expect(requestSignal!.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  },
);
