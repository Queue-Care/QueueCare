import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  searchHospitals,
  type Hospital,
  type HospitalFilters,
} from './hospitalSearch';

type SearchState = {
  status: 'loading' | 'ready' | 'error';
  hospitals: Hospital[];
  page: number;
  total: number;
  hasNextPage: boolean;
  loadingMore: boolean;
  moreError: boolean;
};
const initialState: SearchState = {
  status: 'loading',
  hospitals: [],
  page: 0,
  total: 0,
  hasNextPage: false,
  loadingMore: false,
  moreError: false,
};

// Pass the saved form submission, so editing draft inputs does not restart requests.
export function useHospitalSearch(filters: HospitalFilters) {
  const [state, setState] = useState<SearchState>(initialState);
  const current = useRef<{
    id: number;
    busy: boolean;
    controller?: AbortController;
  }>({ id: 0, busy: false });
  const cancel = useCallback(() => {
    current.current.controller?.abort();
    current.current.id += 1;
    current.current.busy = false;
  }, []);
  const load = useCallback(
    (page: number, append = false) => {
      cancel();
      const id = current.current.id;
      const controller = new AbortController();
      current.current.controller = controller;
      current.current.busy = true;
      setState(previous =>
        append
          ? { ...previous, loadingMore: true, moreError: false }
          : initialState,
      );
      searchHospitals(filters, page, controller.signal)
        .then(result => {
          if (current.current.id !== id || controller.signal.aborted) return;
          current.current.busy = false;
          setState(previous => ({
            status: 'ready',
            hospitals: append
              ? Array.from(
                  new Map(
                    [...previous.hospitals, ...result.hospitals].map(
                      hospital => [hospital.id, hospital],
                    ),
                  ).values(),
                )
              : result.hospitals,
            page: result.page,
            total: result.total,
            hasNextPage: result.hasNextPage,
            loadingMore: false,
            moreError: false,
          }));
        })
        .catch(() => {
          if (current.current.id !== id || controller.signal.aborted) return;
          current.current.busy = false;
          setState(previous =>
            append
              ? { ...previous, loadingMore: false, moreError: true }
              : { ...initialState, status: 'error' },
          );
        });
    },
    [filters, cancel],
  );

  useFocusEffect(
    useCallback(() => {
      load(1);
      return cancel;
    }, [load, cancel]),
  );

  return {
    state,
    reload: () => load(1),
    loadMore: () => {
      if (
        state.status === 'ready' &&
        state.hasNextPage &&
        state.page < 1000 &&
        !current.current.busy
      )
        load(state.page + 1, true);
    },
  };
}
