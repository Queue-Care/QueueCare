import {
  getHospitalDetails,
  getHospitalServices,
  parseHospitalDetails,
  parseHospitalServices,
  HospitalDetailsError,
} from '../src/features/hospitals/hospitalDetails';

const hospitalId = 'abcdef000000000000000101';
const serviceId = 'abcdef000000000000000201';
const hospital = {
  _id: hospitalId,
  name: 'Demo Hospital',
  address: 'Demo address',
  city: 'Colombo',
  phone: 'Test phone',
};
const service = { _id: serviceId, hospitalId, name: 'General OPD' };
const details = { success: true, data: hospital };
const services = { success: true, data: [service], meta: { total: 1 } };
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
test('loads public details and services with canonical IDs and no JWT', async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => details })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => services,
    });
  const signal = new AbortController().signal;
  expect(await getHospitalDetails(hospitalId.toUpperCase(), signal)).toEqual({
    id: hospitalId,
    name: hospital.name,
    address: hospital.address,
    city: hospital.city,
    phone: hospital.phone,
  });
  expect(await getHospitalServices(hospitalId, signal)).toEqual([
    { id: serviceId, hospitalId, name: service.name },
  ]);
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
    `http://192.0.2.1:4000/api/v1/hospitals/${hospitalId}`,
    `http://192.0.2.1:4000/api/v1/hospitals/${hospitalId}/services`,
  ]);
  for (const call of fetchMock.mock.calls)
    expect(call[1].headers).toEqual({ Accept: 'application/json' });
});
test('optional contact data and a successful empty catalog are supported', () => {
  expect(
    parseHospitalDetails(
      { success: true, data: { ...hospital, phone: undefined } },
      hospitalId,
    ).phone,
  ).toBeUndefined();
  expect(
    parseHospitalServices(
      { success: true, data: [], meta: { total: 0 } },
      hospitalId,
    ),
  ).toEqual([]);
});
test.each([
  null,
  { ...details, success: false },
  { ...details, data: [] },
  { ...details, data: { ...hospital, _id: serviceId } },
  { ...details, data: { ...hospital, name: '' } },
  { ...details, data: { ...hospital, phone: 123 } },
])('rejects malformed or mismatched hospital details (%#)', payload => {
  expect(() => parseHospitalDetails(payload, hospitalId)).toThrow(
    HospitalDetailsError,
  );
});
test.each([
  null,
  { ...services, success: false },
  { ...services, data: {} },
  { ...services, meta: { total: 5 } },
  { ...services, data: [{ ...service, hospitalId: serviceId }] },
  { ...services, data: [{ ...service, name: '' }] },
  { ...services, data: [{ ...service, _id: 'invalid' }] },
  { ...services, data: [service, service], meta: { total: 2 } },
])('rejects invalid, duplicate, or cross-hospital services (%#)', payload => {
  expect(() => parseHospitalServices(payload, hospitalId)).toThrow(
    HospitalDetailsError,
  );
});
test('invalid IDs, missing configuration, and pre-cancelled requests never fetch', async () => {
  const signal = new AbortController().signal;
  await expect(getHospitalDetails('../private', signal)).rejects.toMatchObject({
    kind: 'unavailable',
  });
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  await expect(getHospitalServices(hospitalId, signal)).rejects.toMatchObject({
    kind: 'configuration',
  });
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.0.2.1:4000/api/v1';
  const controller = new AbortController();
  controller.abort();
  await expect(
    getHospitalDetails(hospitalId, controller.signal),
  ).rejects.toMatchObject({ kind: 'network' });
  expect(fetchMock).not.toHaveBeenCalled();
});
test.each([getHospitalDetails, getHospitalServices])(
  'distinguishes 404, server error, and malformed JSON (%#)',
  async load => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('private backend message');
        },
      });
    await expect(
      load(hospitalId, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(
      load(hospitalId, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'response' });
    await expect(
      load(hospitalId, new AbortController().signal),
    ).rejects.toThrow('Unable to load hospital details');
  },
);
test.each(['timeout', 'cancel'] as const)(
  '%s cancels both requests and clears timers',
  async action => {
    jest.useFakeTimers();
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url, options) => {
      signals.push(options.signal);
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      );
    });
    const controller = new AbortController();
    const checks = [
      getHospitalDetails(hospitalId, controller.signal),
      getHospitalServices(hospitalId, controller.signal),
    ].map(promise =>
      expect(promise).rejects.toMatchObject({ kind: 'network' }),
    );
    if (action === 'timeout') await jest.advanceTimersByTimeAsync(15000);
    else controller.abort();
    await Promise.all(checks);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  },
);
