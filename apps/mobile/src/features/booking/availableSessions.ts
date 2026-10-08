export const SESSION_TIME_ZONE = 'Asia/Colombo';
export type SessionQuery = {
  hospitalId: string;
  serviceId?: string;
  date: string;
};
export type AvailableSession = {
  id: string;
  hospitalId: string;
  serviceId: string;
  serviceName: string;
  doctorOrTeam: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  remainingCapacity: number;
  normalRemainingCapacity?: number;
  isBookable: boolean;
};
export class AvailableSessionsError extends Error {
  constructor(
    public readonly kind:
      | 'configuration'
      | 'network'
      | 'response'
      | 'unavailable'
      | 'validation',
  ) {
    super('Unable to load OPD sessions');
    this.name = 'AvailableSessionsError';
  }
}
export function isCalendarDate(value: string) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value
  );
}
export function colomboDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: SESSION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function sessionTimeLabel(
  session: Pick<AvailableSession, 'startsAt' | 'endsAt'>,
) {
  const time = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: SESSION_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(value));
  return `${time(session.startsAt)} – ${time(session.endsAt)}`;
}
export function isSessionBookable(session: AvailableSession, now = Date.now()) {
  return session.isBookable && Date.parse(session.startsAt) > now;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function objectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
// Validate that the server's UTC instant and Sri Lanka wall-clock fields agree.
export function matchesSessionInstant(
  value: unknown,
  date: string,
  time: unknown,
): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value) ||
    typeof time !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    return false;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value)
    return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SESSION_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  return (
    colomboDate(instant) === date &&
    `${parts.find(item => item.type === 'hour')!.value}:${
      parts.find(item => item.type === 'minute')!.value
    }` === time
  );
}
export function parseAvailableSessions(
  payload: unknown,
  query: SessionQuery,
): AvailableSession[] {
  if (
    !record(payload) ||
    payload.success !== true ||
    !Array.isArray(payload.data) ||
    !record(payload.meta) ||
    payload.meta.date !== query.date ||
    payload.meta.timeZone !== SESSION_TIME_ZONE ||
    payload.meta.total !== payload.data.length
  )
    throw new AvailableSessionsError('response');
  const sessions = payload.data.map((item: unknown) => {
    if (
      !record(item) ||
      !objectId(item._id) ||
      !objectId(item.hospitalId) ||
      item.hospitalId.toLowerCase() !== query.hospitalId.toLowerCase() ||
      !objectId(item.serviceId) ||
      (query.serviceId !== undefined &&
        item.serviceId.toLowerCase() !== query.serviceId.toLowerCase()) ||
      !text(item.serviceName) ||
      !text(item.doctorOrTeam) ||
      item.sessionDate !== query.date ||
      item.status !== 'OPEN' ||
      !matchesSessionInstant(item.startsAt, query.date, item.startTime) ||
      !matchesSessionInstant(item.endsAt, query.date, item.endTime) ||
      Date.parse(item.endsAt) <= Date.parse(item.startsAt) ||
      !integer(item.capacity) ||
      item.capacity === 0 ||
      !integer(item.bookedCount) ||
      item.remainingCapacity !==
        Math.max(0, item.capacity - item.bookedCount) ||
      (item.normalRemainingCapacity !== undefined &&
        (!integer(item.normalRemainingCapacity) || item.normalRemainingCapacity > (item.remainingCapacity as number))) ||
      item.isBookable !== ((item.normalRemainingCapacity ?? item.remainingCapacity) as number) > 0
    )
      throw new AvailableSessionsError('response');
    return {
      id: item._id.toLowerCase(),
      hospitalId: item.hospitalId.toLowerCase(),
      serviceId: item.serviceId.toLowerCase(),
      serviceName: item.serviceName,
      doctorOrTeam: item.doctorOrTeam,
      sessionDate: query.date,
      startTime: item.startTime as string,
      endTime: item.endTime as string,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      capacity: item.capacity,
      bookedCount: item.bookedCount,
      remainingCapacity: item.remainingCapacity as number,
      ...(item.normalRemainingCapacity !== undefined ? { normalRemainingCapacity: item.normalRemainingCapacity as number } : {}),
      isBookable: item.isBookable as boolean,
    };
  });
  if (
    new Set(sessions.map(item => item.id)).size !== sessions.length ||
    payload.meta.bookableCount !==
      sessions.filter(item => item.isBookable).length
  )
    throw new AvailableSessionsError('response');
  return sessions.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id),
  );
}
export async function getAvailableSessions(
  query: SessionQuery,
  signal: AbortSignal,
) {
  if (
    !objectId(query.hospitalId) ||
    (query.serviceId !== undefined && !objectId(query.serviceId))
  )
    throw new AvailableSessionsError('unavailable');
  if (!isCalendarDate(query.date))
    throw new AvailableSessionsError('validation');
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(
    /\/+$/,
    '',
  );
  if (!baseUrl || !/^https?:\/\//.test(baseUrl))
    throw new AvailableSessionsError('configuration');
  if (signal.aborted) throw new AvailableSessionsError('network');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel);
  const timeout = setTimeout(cancel, 15000);
  try {
    const service = query.serviceId
      ? `&serviceId=${query.serviceId.toLowerCase()}`
      : '';
    const response = await fetch(
      `${baseUrl}/hospitals/${query.hospitalId.toLowerCase()}/sessions?date=${
        query.date
      }${service}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (response.status === 404)
      throw new AvailableSessionsError('unavailable');
    if (!response.ok) throw new AvailableSessionsError('network');
    return parseAvailableSessions(await response.json(), query);
  } catch (error) {
    if (error instanceof AvailableSessionsError) throw error;
    throw new AvailableSessionsError('network');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
