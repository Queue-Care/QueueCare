import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { isCalendarDate } from '../booking/availableSessions';
import type { StaffOpdSession } from './k_staffSessions';

export const endedSessionMessage = 'This session has ended and can no longer be edited.';

export function sessionEndTimestamp(session: Pick<StaffOpdSession, 'sessionDate' | 'endTime'>) {
  if (!isCalendarDate(session.sessionDate) || !session.endTime || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(session.endTime)) return null;
  return new Date(`${session.sessionDate}T${session.endTime}:00+05:30`).getTime();
}

export function sessionHasEnded(session: Pick<StaffOpdSession, 'sessionDate' | 'endTime'>, now = Date.now()) {
  const end = sessionEndTimestamp(session);
  return end !== null && now > end;
}

// One boundary timer per screen; no API polling or session mutations.
export function useSessionEditClock(endTimes: (number | null)[]) {
  const [now, setNow] = useState(Date.now);
  const navigation = useContext(NavigationContext);
  const nextEnd = Math.min(...endTimes.filter((end): end is number => end !== null && end >= now));
  useEffect(() => {
    if (!Number.isFinite(nextEnd)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(0, nextEnd - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [nextEnd, now]);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const focus = navigation?.addListener('focus', update);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { focus?.(); subscription.remove(); };
  }, [navigation]);
  return now;
}
