import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './navigation/AppNavigator';
import { loadStartupSession } from './features/startup/loadStartupSession';
import {
  useAppStartup,
  type SessionLoader,
} from './features/startup/useAppStartup';
import { SplashScreen } from './screens/SplashScreen';

export default function App({
  loadSession = loadStartupSession,
}: {
  loadSession?: SessionLoader;
}) {
  const { state, retry, continueSignedOut, signIn } = useAppStartup(loadSession);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      {state.status === 'error' ? (
        <SplashScreen error onRetry={retry} onContinue={continueSignedOut} />
      ) : (
        <AppNavigator
          onSignedIn={signIn}
          onSessionExpired={continueSignedOut}
          isRestoring={state.status === 'loading'}
          session={state.status === 'ready' ? state.session : null}
        />
      )}
    </SafeAreaProvider>
  );
}
