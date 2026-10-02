import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getHospitalDetails,
  getHospitalServices,
  HospitalDetailsError,
  type HospitalDetails,
  type HospitalService,
} from './hospitalDetails';

type DetailsState =
  | { status: 'loading' | 'error' | 'unavailable' }
  | {
      status: 'ready';
      hospital: HospitalDetails;
      services: HospitalService[];
      servicesFailed: boolean;
    };

export function useHospitalDetails(hospitalId: string) {
  const [result, setResult] = useState<{
    hospitalId: string;
    state: DetailsState;
  }>({ hospitalId, state: { status: 'loading' } });
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
    setResult({ hospitalId, state: { status: 'loading' } });
    void Promise.allSettled([
      getHospitalDetails(hospitalId, controller.signal),
      getHospitalServices(hospitalId, controller.signal),
    ]).then(([details, services]) => {
      if (id !== current.current.id || controller.signal.aborted) return;
      let state: DetailsState;
      if (
        [details, services].some(
          item =>
            item.status === 'rejected' &&
            item.reason instanceof HospitalDetailsError &&
            item.reason.kind === 'unavailable',
        )
      ) {
        state = { status: 'unavailable' };
      } else if (details.status === 'rejected') {
        state = { status: 'error' };
      } else {
        state = {
          status: 'ready',
          hospital: details.value,
          services: services.status === 'fulfilled' ? services.value : [],
          servicesFailed: services.status === 'rejected',
        };
      }
      setResult({ hospitalId, state });
    });
  }, [hospitalId, cancel]);
  useFocusEffect(
    useCallback(() => {
      reload();
      return cancel;
    }, [reload, cancel]),
  );
  const state: DetailsState =
    result.hospitalId === hospitalId ? result.state : { status: 'loading' };
  return { state, reload };
}
