import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getHospitalDetails,
  HospitalDetailsError,
  type HospitalDetails,
} from '../hospitals/hospitalDetails';
import {
  AvailableSessionsError,
  getAvailableSessions,
  isSessionBookable,
  type AvailableSession,
  type SessionQuery,
} from './availableSessions';

type State =
  | { status: 'loading' | 'error' | 'unavailable' }
  | {
      status: 'ready';
      hospital: HospitalDetails;
      sessions: AvailableSession[];
    };
export function useAvailableSessions({
  hospitalId,
  serviceId,
  date,
}: SessionQuery) {
  const key = `${hospitalId}:${serviceId ?? ''}:${date}`;
  const [result, setResult] = useState<{ key: string; state: State }>();
  const [selection, setSelection] = useState<{
    key: string;
    id: string;
  } | null>(null);
  const [now, setNow] = useState(Date.now);
  const current = useRef<{ id: number; controller?: AbortController }>({
    id: 0,
  });
  const cancel = useCallback(() => {
    current.current.controller?.abort();
    current.current.id += 1;
  }, []);
  const reload = useCallback(() => {
    cancel();
    const id = current.current.id;
    const controller = new AbortController();
    current.current.controller = controller;
    setSelection(null);
    setNow(Date.now());
    setResult({ key, state: { status: 'loading' } });
    void Promise.allSettled([
      getHospitalDetails(hospitalId, controller.signal),
      getAvailableSessions({ hospitalId, serviceId, date }, controller.signal),
    ]).then(([hospital, sessions]) => {
      if (controller.signal.aborted || id !== current.current.id) return;
      let state: State;
      if (
        [hospital, sessions].some(
          item =>
            item.status === 'rejected' &&
            (item.reason instanceof HospitalDetailsError ||
              item.reason instanceof AvailableSessionsError) &&
            item.reason.kind === 'unavailable',
        )
      ) {
        state = { status: 'unavailable' };
      } else if (
        hospital.status === 'rejected' ||
        sessions.status === 'rejected'
      ) {
        state = { status: 'error' };
      } else {
        state = {
          status: 'ready',
          hospital: hospital.value,
          sessions: sessions.value,
        };
      }
      setNow(Date.now());
      setResult({ key, state });
    });
  }, [cancel, key, hospitalId, serviceId, date]);
  useFocusEffect(
    useCallback(() => {
      reload();
      // Expire displayed sessions while the screen stays open; capacity refresh is explicit.
      const timer = setInterval(() => setNow(Date.now()), 30000);
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') reload();
        else cancel();
      });
      return () => {
        cancel();
        clearInterval(timer);
        subscription.remove();
      };
    }, [reload, cancel]),
  );
  const state: State =
    result?.key === key ? result.state : { status: 'loading' };
  const selected =
    state.status === 'ready' && selection?.key === key
      ? state.sessions.find(
          item => item.id === selection.id && isSessionBookable(item, now),
        )
      : undefined;
  const select = (session: AvailableSession) => {
    if (
      state.status === 'ready' &&
      state.sessions.includes(session) &&
      isSessionBookable(session)
    ) {
      setSelection({ key, id: session.id });
    }
  };
  return { state, selected, select, reload, now };
}
