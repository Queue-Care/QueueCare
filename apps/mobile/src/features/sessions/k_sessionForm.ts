import { isCalendarDate } from '../booking/availableSessions';
import type { SessionInput, StaffOpdSession } from './k_staffSessions';

export type SessionForm = Omit<SessionInput, 'capacity'> & { capacity: string };
export const emptySessionForm: SessionForm = { serviceId: '', sessionDate: '', startTime: '',
  endTime: '', capacity: '', doctorOrTeam: '' };

export function sessionFormValues(session: StaffOpdSession): SessionForm {
  return { serviceId: session.serviceId ?? '', sessionDate: session.sessionDate,
    startTime: session.startTime ?? '', endTime: session.endTime ?? '',
    capacity: session.capacity?.toString() ?? '', doctorOrTeam: session.doctorOrTeam ?? '' };
}

export function validateSessionForm(form: SessionForm, options: {
  mode?: 'create' | 'edit'; bookedCount?: number | null; serviceIds?: string[]; now?: Date;
} = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.serviceId.trim()) errors.serviceId = 'Select an OPD service.';
  else if (!/^[a-f\d]{24}$/i.test(form.serviceId)) errors.serviceId = 'Choose a department/service.';
  else if (options.serviceIds && !options.serviceIds.includes(form.serviceId))
    errors.serviceId = 'Choose an available department/service.';
  if (!form.sessionDate.trim()) errors.sessionDate = 'Select a date.';
  else if (!isCalendarDate(form.sessionDate)) errors.sessionDate = 'Enter a real date as YYYY-MM-DD.';
  for (const key of ['startTime', 'endTime'] as const)
    if (!form[key].trim()) errors[key] = key === 'startTime' ? 'Select a start time.' : 'Select an end time.';
    else if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form[key])) errors[key] = 'Use 24-hour HH:mm, for example 08:30.';
  if (!errors.startTime && !errors.endTime && form.endTime <= form.startTime)
    errors.endTime = 'End time must be after start time on the same day.';
  if (options.mode === 'create' && !errors.sessionDate && !errors.startTime &&
      new Date(`${form.sessionDate}T${form.startTime}:00+05:30`) <= (options.now ?? new Date()))
    errors.startTime = 'Start time must be in the future.';
  if (!form.capacity.trim()) errors.capacity = 'Enter patient capacity.';
  else if (!/^[1-9]\d*$/.test(form.capacity) || !Number.isSafeInteger(Number(form.capacity)))
    errors.capacity = 'Enter a positive whole-number capacity.';
  else if (options.mode === 'edit' && Number.isSafeInteger(options.bookedCount) &&
      Number(form.capacity) < (options.bookedCount as number))
    errors.capacity = 'Capacity must not be below the existing booked count.';
  if (/^-?\d+$/.test(form.capacity) && Number(form.capacity) <= 0)
    errors.capacity = 'Capacity must be at least 1.';
  if (!form.doctorOrTeam.trim()) errors.doctorOrTeam = 'Enter a doctor or clinic team.';
  return errors;
}

// Picker values represent instants; the API represents Sri Lankan calendar days/times.
export function pickerStrings(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23' }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

export function friendlySessionDate(value: string) {
  return isCalendarDate(value) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00Z`)) : 'Select date';
}

export function friendlySessionTime(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return 'Select time';
  const hour = Number(value.slice(0, 2));
  return `${String(hour % 12 || 12).padStart(2, '0')}:${value.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
}
