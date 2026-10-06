import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ApiError, errorMessage } from './g_apiClient';

type State<T> = { loading: boolean; data?: T; error?: string };

// Loads when the screen gains focus and, with pollMs, keeps it fresh while visible
// (README section 17: REST polling, stopped when the screen is hidden).
export function useApiResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  options: { pollMs?: number; onUnauthorized?: () => void } = {},
) {
  const { pollMs } = options;
  const [state, setState] = useState<State<T>>({ loading: true });
  const [version, setVersion] = useState(0);
  const onUnauthorized = useRef(options.onUnauthorized);
  useEffect(() => {
    onUnauthorized.current = options.onUnauthorized;
  });

  useFocusEffect(
    useCallback(() => {
      // The refresh version intentionally restarts the focused request.
      void version;
      const controller = new AbortController();
      const run = (silent: boolean) => {
        if (!silent) setState(current => ({ ...current, loading: true }));
        load(controller.signal)
          .then(data => {
            if (!controller.signal.aborted) setState({ loading: false, data });
          })
          .catch(error => {
            if (controller.signal.aborted) return;
            if (error instanceof ApiError && error.status === 401)
              onUnauthorized.current?.();
            // A failed background refresh keeps the last good data on screen.
            setState(current =>
              silent && current.data !== undefined
                ? current
                : { loading: false, error: errorMessage(error) },
            );
          });
      };
      run(false);
      const timer = pollMs ? setInterval(() => run(true), pollMs) : undefined;
      return () => {
        controller.abort();
        if (timer) clearInterval(timer);
      };
    }, [load, version, pollMs]),
  );

  return {
    ...state,
    reload: useCallback(() => setVersion(value => value + 1), []),
    setData: useCallback((data: T) => setState({ loading: false, data }), []),
  };
}
