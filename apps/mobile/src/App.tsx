import React, { useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './navigation/AppNavigator';
import { loadStartupSession } from './features/startup/loadStartupSession';
import {
  useAppStartup,
  type SessionLoader,
} from './features/startup/useAppStartup';
import { SplashScreen } from './screens/SplashScreen';
import type { NavigationSession } from './navigation/types';

export default function App({
  loadSession = loadStartupSession,
}: {
  loadSession?: SessionLoader;
}) {
  const { state, retry, continueSignedOut } = useAppStartup(loadSession);
  const [staffSession, setStaffSession] = useState<NavigationSession | null>(null);
  // Sign-out and an expired token both discard the in-memory session.
  const signOut = () => {
    setStaffSession(null);
    continueSignedOut();
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {state.status === 'error' ? (
        <SplashScreen error onRetry={retry} onContinue={continueSignedOut} />
      ) : (
        <AppNavigator
          onSessionExpired={signOut}
          onSignOut={signOut}
          onStaffAuthenticated={setStaffSession}
          isRestoring={state.status === 'loading'}
          session={staffSession ?? (state.status === 'ready' ? state.session : null)}
        />
      )}
    </SafeAreaProvider>
  );
}
