import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ApiError, errorMessage } from '../../api/g_apiClient';
import type { StaffDashboard } from './g_staffDashboard';

type State = { loading: boolean; data?: StaffDashboard; error?: string };
export const RECEPTION_DASHBOARD_POLL_MS = 10000;

// Member 3's dashboard polls the existing metrics API only while focused/active.
export function useReceptionDashboard(
  load: (signal: AbortSignal) => Promise<StaffDashboard>,
  { onUnauthorized }: { onUnauthorized?: () => void } = {},
) {
  const [state, setState] = useState<State>({ loading: true });
  const [version, setVersion] = useState(0);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => { unauthorized.current = onUnauthorized; });

  useFocusEffect(useCallback(() => {
    // Manual refresh restarts the focused request and cancels its predecessor.
    void version;
    let controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    let running = false;
    const run = (silent: boolean) => {
      if (running || controller.signal.aborted) return;
      running = true;
      const signal = controller.signal;
      if (!silent) setState(current => ({ ...current, loading: true }));
      void load(signal).then(data => {
        if (!signal.aborted) setState({ loading: false, data });
      }).catch(reason => {
        if (signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 401) unauthorized.current?.();
        setState(current => silent && current.data !== undefined ? current
          : { loading: false, error: errorMessage(reason) });
      }).finally(() => { if (!signal.aborted) running = false; });
    };
    const stop = () => {
      controller.abort();
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      running = false;
    };
    const start = () => {
      if (timer !== undefined) return;
      controller = new AbortController();
      run(false);
      timer = setInterval(() => run(true), RECEPTION_DASHBOARD_POLL_MS);
    };
    if (AppState.currentState === 'active' || AppState.currentState === null) start();
    const subscription = AppState.addEventListener('change', appState => {
      if (appState === 'active') start(); else stop();
    });
    return () => { stop(); subscription.remove(); };
  }, [load, version]));

  return { ...state, reload: useCallback(() => setVersion(value => value + 1), []) };
}
