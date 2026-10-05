import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { message } from './api';

export function usePatientResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<{
    loading: boolean;
    data?: T;
    error?: string;
  }>({ loading: true });
  const [version, setVersion] = useState(0);
  useFocusEffect(
    useCallback(() => {
      // The refresh version intentionally restarts the focused request.
      void version;
      const controller = new AbortController();
      setState({ loading: true });
      load(controller.signal)
        .then(data => {
          if (!controller.signal.aborted) setState({ loading: false, data });
        })
        .catch(error => {
          if (!controller.signal.aborted)
            setState({ loading: false, error: message(error) });
        });
      return () => controller.abort();
    }, [load, version]),
  );
  return {
    ...state,
    reload: useCallback(() => setVersion(value => value + 1), []),
  };
}
