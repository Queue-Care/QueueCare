export type Hospital = {
  id: string;
  name: string;
  city: string;
  address: string;
};
export type HospitalFilters = { search: string; city: string };
export type HospitalPage = {
  hospitals: Hospital[];
  page: number;
  total: number;
  hasNextPage: boolean;
};
export const HOSPITAL_PAGE_SIZE = 20;

export class HospitalSearchError extends Error {
  constructor(public readonly kind: 'configuration' | 'network' | 'response') {
    super('Unable to load hospitals');
    this.name = 'HospitalSearchError';
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseHospitalPage(
  payload: unknown,
  page: number,
): HospitalPage {
  if (
    !record(payload) ||
    payload.success !== true ||
    !Array.isArray(payload.data) ||
    !record(payload.meta)
  ) {
    throw new HospitalSearchError('response');
  }
  const { meta, data } = payload;
  if (
    meta.page !== page ||
    meta.limit !== HOSPITAL_PAGE_SIZE ||
    typeof meta.total !== 'number' ||
    !Number.isSafeInteger(meta.total) ||
    meta.total < 0 ||
    meta.totalPages !== Math.ceil(meta.total / HOSPITAL_PAGE_SIZE) ||
    meta.hasNextPage !== page * HOSPITAL_PAGE_SIZE < meta.total ||
    data.length > HOSPITAL_PAGE_SIZE
  ) {
    throw new HospitalSearchError('response');
  }
  const hospitals = data.map((item: unknown) => {
    if (
      !record(item) ||
      !text(item._id) ||
      !text(item.name) ||
      !text(item.city) ||
      !text(item.address)
    ) {
      throw new HospitalSearchError('response');
    }
    return {
      id: item._id,
      name: item.name,
      city: item.city,
      address: item.address,
    };
  });
  if (new Set(hospitals.map(item => item.id)).size !== hospitals.length)
    throw new HospitalSearchError('response');
  return {
    hospitals,
    page,
    total: meta.total,
    hasNextPage: meta.hasNextPage as boolean,
  };
}

export async function searchHospitals(
  filters: HospitalFilters,
  page: number,
  signal: AbortSignal,
): Promise<HospitalPage> {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(
    /\/+$/,
    '',
  );
  if (!baseUrl || !/^https?:\/\//.test(baseUrl))
    throw new HospitalSearchError('configuration');
  const query = `search=${encodeURIComponent(
    filters.search.trim(),
  )}&city=${encodeURIComponent(
    filters.city.trim(),
  )}&page=${page}&limit=${HOSPITAL_PAGE_SIZE}`;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) throw new HospitalSearchError('network');
  signal.addEventListener('abort', cancel);
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(`${baseUrl}/hospitals?${query}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new HospitalSearchError('network');
    return parseHospitalPage(await response.json(), page);
  } catch (error) {
    if (error instanceof HospitalSearchError) throw error;
    throw new HospitalSearchError('network');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
