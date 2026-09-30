import React from 'react';
import { ActivityIndicator } from 'react-native';
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

function Welcome({
  navigation,
}: NativeStackScreenProps<RootStackParams, 'Welcome'>) {
  return (
    <NavigationPage
      title="QueueCare"
      description="Hospital appointments made simpler."
      actions={[
        {
          label: 'Get Started',
          onPress: () =>
            navigation.navigate('ChooseRole', { intent: 'register' }),
        },
        {
          label: 'I already have an account',
          onPress: () =>
            navigation.navigate('ChooseRole', { intent: 'signIn' }),
        },
        {
          label: 'Continue as guest',
          onPress: () => navigation.navigate('Guest'),
        },
      ]}
    />
  );
}
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
              screen: registering ? 'StaffRegistration' : 'StaffSignIn',
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
function PatientApp() {
  return <PatientNavigator guest={false} onSignIn={() => {}} />;
}

export type AppNavigatorProps = {
  session?: NavigationSession | null;
  isRestoring?: boolean;
  navigationRef?: React.Ref<NavigationContainerRef<RootStackParams>>;
};

export function AppNavigator({
  session = null,
  isRestoring = false,
  navigationRef,
}: AppNavigatorProps) {
  // S-13 will supply the restored, validated session. Selecting a role is not login.
  if (isRestoring) {
    return (
      <>
        <NavigationPage title="QueueCare" description="Opening your account…" />
        <ActivityIndicator
          accessibilityLabel="Loading account"
          color={navigationColors.primary}
        />
      </>
    );
  }
  return (
    <NavigationContainer ref={navigationRef} theme={theme}>
      <Root.Navigator
        key={session ? `${session.userId}:${session.role}` : 'signed-out'}
        screenOptions={stackOptions}
      >
        {session ? (
          session.role === 'PATIENT' ? (
            <Root.Screen
              name="PatientApp"
              component={PatientApp}
              options={{ headerShown: false }}
            />
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
              component={Welcome}
              options={{ title: 'Welcome' }}
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
