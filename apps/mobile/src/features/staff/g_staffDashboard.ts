import {
  apiRequest,
  isRecord,
  isText,
  resolveImageUrl,
  unreadableResponse,
} from '../../api/g_apiClient';

export type SessionLabel = 'Running' | 'Next' | 'Later' | 'Ended' | 'Cancelled';
export type DashboardSession = {
  _id: string;
  serviceName: string;
  startsAt: string | null;
  capacity: number;
  bookedCount: number;
  label: SessionLabel;
};
export type StaffDashboard = {
  staff: {
    fullName: string;
    hospital: string | null;
    profileImageUrl: string | null;
  };
  sessionsToday: number;
  priorityWaiting: number;
  patientsCheckedIn: number;
  nowServing: string | null;
  unreadNotifications: number;
  sessions: DashboardSession[];
};

const labels = ['Running', 'Next', 'Later', 'Ended', 'Cancelled'];
const count = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw unreadableResponse();
  return value;
};

export function parseDashboard(value: unknown): StaffDashboard {
  if (
    !isRecord(value) ||
    !isRecord(value.staff) ||
    !isText(value.staff.fullName) ||
    !Array.isArray(value.sessions) ||
    (value.nowServing !== null && !isText(value.nowServing))
  )
    throw unreadableResponse();
  return {
    staff: {
      fullName: value.staff.fullName,
      hospital: isText(value.staff.hospital) ? value.staff.hospital : null,
      profileImageUrl: resolveImageUrl(value.staff.profileImageUrl),
    },
    sessionsToday: count(value.sessionsToday),
    priorityWaiting: count(value.priorityWaiting),
    patientsCheckedIn: count(value.patientsCheckedIn),
    nowServing: isText(value.nowServing) ? value.nowServing : null,
    unreadNotifications: count(value.unreadNotifications),
    sessions: value.sessions.map((session: unknown) => {
      if (!isRecord(session) || !isText(session._id))
        throw unreadableResponse();
      return {
        _id: session._id,
        serviceName: isText(session.serviceName)
          ? session.serviceName
          : 'OPD service',
        startsAt: isText(session.startsAt) ? session.startsAt : null,
        capacity: count(session.capacity),
        bookedCount: count(session.bookedCount),
        label: labels.includes(String(session.label))
          ? (session.label as SessionLabel)
          : 'Later',
      };
    }),
  };
}

export async function fetchDashboard(
  token: string | undefined,
  signal?: AbortSignal,
) {
  return parseDashboard(
    (await apiRequest('/staff/dashboard', { token, signal })).data,
  );
}

export function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      hour: 'numeric',
      hour12: false,
    }).format(now),
  );
  if (hour < 12) return 'Good morning,';
  return hour < 17 ? 'Good afternoon,' : 'Good evening,';
}
