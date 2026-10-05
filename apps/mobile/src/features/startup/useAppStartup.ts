import { useCallback, useEffect, useState } from 'react';
import type { NavigationSession } from '../../navigation/types';

export type SessionLoader = () => Promise<NavigationSession | null>;
type StartupState =
  | { status: 'loading' }
  | { status: 'ready'; session: NavigationSession | null }
  | { status: 'error' };
type StartupResult = {
  loader: SessionLoader;
  attempt: number;
  state: StartupState;
};

function validateSession(session: NavigationSession | null) {
  if (session === null) return;
  if (
    !session ||
    typeof session.userId !== 'string' ||
    !session.userId.trim() ||
    !['PATIENT', 'RECEPTION', 'NURSE'].includes(session.role)
  ) {
    throw new Error('Unsupported session');
  }
}

export function useAppStartup(loadSession: SessionLoader) {
  const [result, setResult] = useState<StartupResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A changed loader or retry immediately hides the previous result.
  const state: StartupState =
    result?.loader === loadSession && result.attempt === attempt
      ? result.state
      : { status: 'loading' };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(loadSession)
      .then(session => {
        validateSession(session);
        if (!cancelled) {
          setResult({
            loader: loadSession,
            attempt,
            state: { status: 'ready', session },
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            loader: loadSession,
            attempt,
            state: { status: 'error' },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadSession, attempt]);

  const retry = useCallback(() => {
    setAttempt(value => value + 1);
  }, []);
  const continueSignedOut = useCallback(() => {
    setResult({
      loader: loadSession,
      attempt,
      state: { status: 'ready', session: null },
    });
  }, [loadSession, attempt]);
  const signIn = useCallback(
    (session: NavigationSession) => {
      validateSession(session);
      setResult({
        loader: loadSession,
        attempt,
        state: { status: 'ready', session },
      });
    },
    [loadSession, attempt],
  );
  return { state, retry, continueSignedOut, signIn };
}
