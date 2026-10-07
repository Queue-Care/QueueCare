import {
  apiRequest,
  isRecord,
  isText,
  unreadableResponse,
} from '../../api/g_apiClient';

export type PriorityStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
export type PriorityReason = 'ELDERLY' | 'MOBILITY' | 'PREGNANT' | 'OTHER';
export type PriorityFilter = 'pending' | 'decided';
export type StaffPriorityRequest = {
  _id: string;
  status: PriorityStatus;
  reason: PriorityReason;
  note: string | null;
  decisionNote: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
  patient: {
    fullName: string;
    maskedNic?: string | null;
    phone?: string | null;
  };
  booking: { _id: string; bookingCode: string | null };
  service: { name: string };
  hospital: { name: string };
  session: { startsAt: string | null };
  queuePriority: string | null;
};

// Labels from the Request Priority and Priority Requests prototype screens.
export const reasonLabels: Record<PriorityReason, string> = {
  ELDERLY: 'Elderly patient',
  MOBILITY: 'Mobility assistance',
  PREGNANT: 'Pregnant patient',
  OTHER: 'Something else',
};
export const statusLabels: Record<PriorityStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
};

const optionalText = (value: unknown) => (isText(value) ? value : null);

export function parsePriorityRequest(value: unknown): StaffPriorityRequest {
  if (
    !isRecord(value) ||
    !isText(value._id) ||
    !(String(value.status) in statusLabels) ||
    !(String(value.reason) in reasonLabels) ||
    !isRecord(value.patient) ||
    !isText(value.patient.fullName) ||
    !isRecord(value.booking) ||
    !isText(value.booking._id) ||
    !isRecord(value.service) ||
    !isRecord(value.hospital) ||
    !isRecord(value.session)
  )
    throw unreadableResponse();
  return {
    _id: value._id,
    status: value.status as PriorityStatus,
    reason: value.reason as PriorityReason,
    note: optionalText(value.note),
    decisionNote: optionalText(value.decisionNote),
    createdAt: optionalText(value.createdAt),
    reviewedAt: optionalText(value.reviewedAt),
    patient: {
      fullName: value.patient.fullName,
      maskedNic: optionalText(value.patient.maskedNic),
      phone: optionalText(value.patient.phone),
    },
    booking: {
      _id: value.booking._id,
      bookingCode: optionalText(value.booking.bookingCode),
    },
    service: { name: optionalText(value.service.name) ?? 'OPD service' },
    hospital: { name: optionalText(value.hospital.name) ?? 'Hospital' },
    session: { startsAt: optionalText(value.session.startsAt) },
    queuePriority: optionalText(value.queuePriority),
  };
}

export async function fetchPriorityRequests(
  token: string | undefined,
  status: PriorityFilter,
  signal?: AbortSignal,
) {
  const { data, meta } = await apiRequest(
    `/staff/priority-requests?status=${status}`,
    { token, signal },
  );
  if (!Array.isArray(data)) throw unreadableResponse();
  return {
    status,
    requests: data.map(parsePriorityRequest),
    pendingCount: typeof meta.pendingCount === 'number' ? meta.pendingCount : 0,
  };
}

export async function fetchPriorityRequest(
  token: string | undefined,
  requestId: string,
  signal?: AbortSignal,
) {
  const { data } = await apiRequest(
    `/staff/priority-requests/${encodeURIComponent(requestId)}`,
    { token, signal },
  );
  return parsePriorityRequest(data);
}

export async function decidePriorityRequest(
  token: string | undefined,
  requestId: string,
  decision: 'ACCEPTED' | 'DECLINED',
) {
  const { data } = await apiRequest(
    `/staff/priority-requests/${encodeURIComponent(requestId)}/decision`,
    { token, method: 'PATCH', body: { decision } },
  );
  return parsePriorityRequest(data);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : parts[0]?.slice(0, 2);
  return (letters ?? '?').toUpperCase();
}

const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const colomboParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Colombo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

// Hospital-local (Asia/Colombo) date parts, assembled by hand so every device
// prints the same text regardless of its locale data.
export function colomboDate(iso: string | Date) {
  const parts = colomboParts.formatToParts(new Date(iso));
  const get = (type: string) =>
    parts.find(part => part.type === type)?.value ?? '';
  return {
    day: get('day'),
    month: months[Number(get('month')) - 1] ?? '',
    year: get('year'),
    time: `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`,
  };
}

export function formatTime(iso: string | null) {
  return iso ? colomboDate(iso).time : '';
}

export function formatSession(iso: string | null) {
  if (!iso) return 'Session time unavailable';
  const { day, month, year, time } = colomboDate(iso);
  return `${day} ${month} ${year} · ${time}`;
}
