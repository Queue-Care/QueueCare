import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getNextAppointment, type NextAppointment } from './nextAppointment';

type AppointmentState =
  | { status: 'loading' }
  | { status: 'ready'; appointment: NextAppointment | null }
  | { status: 'error' };

export function useNextAppointment(enabled: boolean, accessToken?: string) {
  const [result, setResult] = useState<{
    token?: string;
    state: AppointmentState;
  }>({ state: { status: 'loading' } });
  const current = useRef<{ id: number; controller?: AbortController }>({
    id: 0,
  });
  const cancel = useCallback(() => {
    current.current.controller?.abort();
    current.current.id += 1;
  }, []);
  const reload = useCallback(() => {
    if (!enabled) return;
    cancel();
    const id = current.current.id;
    const controller = new AbortController();
    current.current.controller = controller;
    setResult({ token: accessToken, state: { status: 'loading' } });
    getNextAppointment(accessToken, controller.signal)
      .then(appointment => {
        if (current.current.id === id && !controller.signal.aborted) {
          setResult({
            token: accessToken,
            state: { status: 'ready', appointment },
          });
        }
      })
      .catch(() => {
        if (current.current.id === id && !controller.signal.aborted) {
          setResult({ token: accessToken, state: { status: 'error' } });
        }
      });
  }, [enabled, accessToken, cancel]);

  useFocusEffect(
    useCallback(() => {
      reload();
      return cancel;
    }, [reload, cancel]),
  );

  const state: AppointmentState =
    result.token === accessToken ? result.state : { status: 'loading' };
  return { state, reload };
}
