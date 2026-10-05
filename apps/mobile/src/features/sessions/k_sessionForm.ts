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

export function validateSessionForm(form: SessionForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[a-f\d]{24}$/i.test(form.serviceId)) errors.serviceId = 'Choose a department/service.';
  if (!isCalendarDate(form.sessionDate)) errors.sessionDate = 'Enter a real date as YYYY-MM-DD.';
  for (const key of ['startTime', 'endTime'] as const)
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form[key])) errors[key] = 'Use 24-hour HH:mm, for example 08:30.';
  if (!errors.startTime && !errors.endTime && form.endTime <= form.startTime)
    errors.endTime = 'End time must be after start time on the same day.';
  if (!/^[1-9]\d*$/.test(form.capacity) || !Number.isSafeInteger(Number(form.capacity)))
    errors.capacity = 'Enter a positive whole-number capacity.';
  if (!form.doctorOrTeam.trim()) errors.doctorOrTeam = 'Enter the doctor or clinic team.';
  return errors;
}
