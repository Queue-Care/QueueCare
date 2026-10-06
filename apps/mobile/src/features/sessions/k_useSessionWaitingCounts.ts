import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ApiError } from '../../api/g_apiClient';
import { fetchStaffSessionMetrics, type StaffOpdSession } from './k_staffSessions';

export const WAITING_POLL_MS = 10000;
type WaitingState = { count?: number; priorityCount?: number; state: 'loading' | 'fresh' | 'stale' | 'unavailable' };

export function useSessionWaitingCounts(sessions: StaffOpdSession[], token?: string,
  onUnauthorized?: () => void, refreshVersion: unknown = 0, listPending?: { current: boolean }) {
  const [values, setValues] = useState<Record<string, WaitingState>>({});
  const [day, setDay] = useState(colomboDay);
  const unauthorized = useRef(onUnauthorized);
  const cachedToken = useRef(token);
  useEffect(() => { unauthorized.current = onUnauthorized; });
  const ids = [...new Set(sessions.filter(session => session.sessionDate === day &&
    ['OPEN', 'CLOSED', 'RUNNING'].includes(session.status ?? '')).map(session => session._id))].sort();
  const key = ids.join(',');

  useFocusEffect(useCallback(() => {
    // A completed list refresh restarts polling even when its IDs are unchanged.
    void refreshVersion;
    const currentIds = key ? key.split(',') : [];
    let active = true, running = false, generation = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let controller: AbortController | undefined;
    let expired = false;
    const tokenChanged = cachedToken.current !== token;
    cachedToken.current = token;
    setValues(previous => Object.fromEntries(currentIds.map(id => [id,
      (!tokenChanged && previous[id]) || { state: 'loading' }])));
    const stop = () => {
      generation++; controller?.abort(); running = false;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const run = async () => {
      const today = colomboDay();
      if (today !== day) { stop(); setDay(today); return; }
      if (!active || expired || running || listPending?.current || !currentIds.length) return;
      running = true;
      controller = new AbortController();
      const signal = controller.signal, epoch = ++generation;
      let cursor = 0;
      const worker = async () => {
        while (!signal.aborted && cursor < currentIds.length) {
          const id = currentIds[cursor++];
          try {
            const metrics = await fetchStaffSessionMetrics(token, id, signal);
            if (!signal.aborted && active && epoch === generation)
              setValues(previous => ({ ...previous, [id]: { count: metrics.waitingCount,
                priorityCount: metrics.priorityCount, state: 'fresh' } }));
          } catch (reason) {
            if (signal.aborted || !active || epoch !== generation) return;
            setValues(previous => ({ ...previous, [id]: previous[id]?.count !== undefined
              ? { count: previous[id].count, priorityCount: previous[id].priorityCount, state: 'stale' }
              : { state: 'unavailable' } }));
            if (reason instanceof ApiError && reason.status === 401 && !expired) {
              expired = true; unauthorized.current?.(); stop(); return;
            }
          }
        }
      };
      try { await Promise.all(Array.from({ length: Math.min(4, currentIds.length) }, worker)); }
      finally { if (epoch === generation) running = false; }
    };
    const start = () => {
      stop();
      const today = colomboDay();
      if (today !== day) { setDay(today); return; }
      if (!currentIds.length || expired) return;
      void run(); timer = setInterval(() => { void run(); }, WAITING_POLL_MS);
    };
    if (AppState.currentState === 'active' || AppState.currentState === null) start();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') start(); else stop();
    });
    return () => { active = false; stop(); subscription.remove(); };
  }, [key, token, day, refreshVersion, listPending]));

  // Exclude obsolete cached IDs immediately, before effect cleanup runs.
  return Object.fromEntries(ids.map(id => [id, values[id] ?? { state: 'loading' as const }]));
}

function colomboDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric',
    month: '2-digit', day: '2-digit' }).format(new Date());
}
