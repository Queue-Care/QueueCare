import type { Hospital } from './hospitalSearch';

export type HospitalDetails = Hospital & { phone?: string };
export type HospitalService = { id: string; hospitalId: string; name: string };
export class HospitalDetailsError extends Error {
  constructor(
    public readonly kind:
      | 'configuration'
      | 'network'
      | 'response'
      | 'unavailable',
  ) {
    super('Unable to load hospital details');
    this.name = 'HospitalDetailsError';
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function objectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}
export function parseHospitalDetails(
  payload: unknown,
  hospitalId: string,
): HospitalDetails {
  if (!record(payload) || payload.success !== true || !record(payload.data))
    throw new HospitalDetailsError('response');
  const item = payload.data;
  if (
    !objectId(item._id) ||
    item._id.toLowerCase() !== hospitalId.toLowerCase() ||
    !text(item.name) ||
    !text(item.address) ||
    !text(item.city) ||
    (item.phone !== undefined && !text(item.phone))
  )
    throw new HospitalDetailsError('response');
  return {
    id: item._id.toLowerCase(),
    name: item.name,
    address: item.address,
    city: item.city,
    ...(typeof item.phone === 'string' ? { phone: item.phone } : {}),
  };
}
export function parseHospitalServices(
  payload: unknown,
  hospitalId: string,
): HospitalService[] {
  if (
    !record(payload) ||
    payload.success !== true ||
    !Array.isArray(payload.data) ||
    !record(payload.meta) ||
    payload.meta.total !== payload.data.length
  )
    throw new HospitalDetailsError('response');
  const services = payload.data.map((item: unknown) => {
    if (
      !record(item) ||
      !objectId(item._id) ||
      !objectId(item.hospitalId) ||
      item.hospitalId.toLowerCase() !== hospitalId.toLowerCase() ||
      !text(item.name)
    )
      throw new HospitalDetailsError('response');
    return {
      id: item._id.toLowerCase(),
      hospitalId: item.hospitalId.toLowerCase(),
      name: item.name,
    };
  });
  if (new Set(services.map(service => service.id)).size !== services.length)
    throw new HospitalDetailsError('response');
  return services;
}
async function request(
  hospitalId: string,
  suffix: string,
  signal: AbortSignal,
): Promise<unknown> {
  if (!objectId(hospitalId)) throw new HospitalDetailsError('unavailable');
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(
    /\/+$/,
    '',
  );
  if (!baseUrl || !/^https?:\/\//.test(baseUrl))
    throw new HospitalDetailsError('configuration');
  if (signal.aborted) throw new HospitalDetailsError('network');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel);
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(
      `${baseUrl}/hospitals/${hospitalId.toLowerCase()}${suffix}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );
    if (response.status === 404) throw new HospitalDetailsError('unavailable');
    if (!response.ok) throw new HospitalDetailsError('network');
    return await response.json();
  } catch (error) {
    if (error instanceof HospitalDetailsError) throw error;
    throw new HospitalDetailsError('network');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
export async function getHospitalDetails(
  hospitalId: string,
  signal: AbortSignal,
) {
  return parseHospitalDetails(
    await request(hospitalId, '', signal),
    hospitalId,
  );
}
export async function getHospitalServices(
  hospitalId: string,
  signal: AbortSignal,
) {
  return parseHospitalServices(
    await request(hospitalId, '/services', signal),
    hospitalId,
  );
}
