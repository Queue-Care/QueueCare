import React from 'react';
import {
  DefaultTheme,
  NavigationContainer,
  type NavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { PatientAuthNavigator, StaffAuthNavigator } from './AuthNavigators';
import {
  NavigationPage,
  navigationColors,
  stackOptions,
} from './NavigationPage';
import { PatientNavigator } from './PatientNavigator';
import { StaffNavigator } from './StaffNavigator';
import type { NavigationSession, RootStackParams } from './types';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { SplashScreen } from '../screens/SplashScreen';

const Root = createNativeStackNavigator<RootStackParams>();
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: navigationColors.primary,
    background: navigationColors.background,
    card: navigationColors.panel,
    text: navigationColors.text,
    border: navigationColors.border,
  },
};

function ChooseRole({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParams, 'ChooseRole'>) {
  const registering = route.params.intent === 'register';
  return (
    <NavigationPage
      title="Choose your role"
      description="How will you use QueueCare?"
      actions={[
        {
          label: 'Patient',
          onPress: () =>
            navigation.navigate('PatientAuth', {
              screen: registering ? 'PatientCreateAccount' : 'PatientSignIn',
              initial: false,
            }),
        },
        {
          label: 'Hospital staff',
          onPress: () =>
            navigation.navigate('StaffAuth', {
              // Staff enter through sign-in; new users can request access there.
              screen: 'StaffSignIn',
              initial: false,
            }),
        },
      ]}
    />
  );
}
function Guest({
  navigation,
}: NativeStackScreenProps<RootStackParams, 'Guest'>) {
  return (
    <PatientNavigator
      guest
      onExit={() => navigation.goBack()}
      onSignIn={() =>
        navigation.navigate('PatientAuth', { screen: 'PatientSignIn' })
      }
    />
  );
}

export type AppNavigatorProps = {
  session?: NavigationSession | null;
  isRestoring?: boolean;
  onSessionExpired?: () => void;
  navigationRef?: React.Ref<NavigationContainerRef<RootStackParams>>;
};

export function AppNavigator({
  session = null,
  isRestoring = false,
  navigationRef,
  onSessionExpired,
}: AppNavigatorProps) {
  // S-13 will supply the restored, validated session. Selecting a role is not login.
  if (isRestoring) return <SplashScreen />;
  // Reset container-owned history on identity changes, but retain it on token refresh.
  return (
    <NavigationContainer
      key={session ? `${session.userId}:${session.role}` : 'signed-out'}
      ref={navigationRef}
      theme={theme}
    >
      <Root.Navigator screenOptions={stackOptions}>
        {session ? (
          session.role === 'PATIENT' ? (
            <Root.Screen name="PatientApp" options={{ headerShown: false }}>
              {() => (
                <PatientNavigator
                  guest={false}
                  accessToken={session.accessToken}
                  patient={session.patient}
                  patientId={session.userId}
                  onSessionExpired={onSessionExpired}
                  onSignIn={() => {}}
                />
              )}
            </Root.Screen>
          ) : (
            <Root.Screen
              name="StaffApp"
              component={StaffNavigator}
              options={{ headerShown: false }}
            />
          )
        ) : (
          <>
            <Root.Screen
              name="Welcome"
              component={WelcomeScreen}
              options={{ headerShown: false }}
            />
            <Root.Screen
              name="ChooseRole"
              component={ChooseRole}
              options={{ title: 'Choose role' }}
            />
            <Root.Screen
              name="PatientAuth"
              component={PatientAuthNavigator}
              options={{ headerShown: false }}
            />
            <Root.Screen
              name="StaffAuth"
              component={StaffAuthNavigator}
              options={{ headerShown: false }}
            />
            <Root.Screen
              name="Guest"
              component={Guest}
              options={{ headerShown: false }}
            />
          </>
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
