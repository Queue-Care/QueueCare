import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getBookingDetails,
  BookingDetailsError,
  type BookingDetails,
} from './bookingDetails';
type State =
  | { status: 'loading' }
  | { status: 'ready'; booking: BookingDetails }
  | { status: 'error'; kind: BookingDetailsError['kind'] };
export function useBookingDetails(
  bookingId: string,
  patientId?: string,
  accessToken?: string,
) {
  const [result, setResult] = useState<{
    bookingId: string;
    patientId?: string;
    accessToken?: string;
    state: State;
  }>();
  const current = useRef<{ id: number; controller?: AbortController }>({
    id: 0,
  });
  const cancel = useCallback(() => {
    current.current.controller?.abort();
    current.current.id++;
  }, []);
  const reload = useCallback(() => {
    cancel();
    const id = current.current.id;
    const controller = new AbortController();
    current.current.controller = controller;
    const save = (state: State) =>
      setResult({ bookingId, patientId, accessToken, state });
    save({ status: 'loading' });
    void getBookingDetails(bookingId, patientId, accessToken, controller.signal)
      .then(booking => {
        if (!controller.signal.aborted && id === current.current.id)
          save({ status: 'ready', booking });
      })
      .catch(error => {
        if (!controller.signal.aborted && id === current.current.id)
          save({
            status: 'error',
            kind: error instanceof BookingDetailsError ? error.kind : 'network',
          });
      });
  }, [bookingId, patientId, accessToken, cancel]);
  useFocusEffect(
    useCallback(() => {
      reload();
      const listener = AppState.addEventListener('change', state => {
        if (state === 'active') reload();
        else cancel();
      });
      return () => {
        listener.remove();
        cancel();
      };
    }, [reload, cancel]),
  );
  const state: State =
    result?.bookingId === bookingId &&
    result.patientId === patientId &&
    result.accessToken === accessToken
      ? result.state
      : { status: 'loading' };
  return { state, reload };
}
