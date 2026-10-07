import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationPage, stackOptions } from './NavigationPage';
import type {
  NavigationSession,
  PatientAuthParams,
  StaffAuthParams,
} from './types';
import { PatientSignInScreen } from '../screens/PatientSignInScreen';
import { CreateAccountScreen } from '../screens/CreateAccountScreen';
import { StaffSignInScreen } from '../screens/StaffSignInScreen';
import { StaffRegistrationScreen } from '../screens/StaffRegistrationScreen';

const Patient = createNativeStackNavigator<PatientAuthParams>();
const Staff = createNativeStackNavigator<StaffAuthParams>();

export function PatientAuthNavigator({
  onSignedIn,
}: {
  onSignedIn?: (session: NavigationSession) => void;
}) {
  return (
    <Patient.Navigator screenOptions={stackOptions}>
      <Patient.Screen
        name="PatientSignIn"
        options={{ title: 'Patient sign in' }}
      >
        {props => <PatientSignInScreen {...props} onSignedIn={onSignedIn} />}
      </Patient.Screen>
      <Patient.Screen
        name="PatientCreateAccount"
        options={{ title: 'Create account' }}
        component={CreateAccountScreen}
      />
      <Patient.Screen
        name="ResetPassword"
        options={{ title: 'Reset password' }}
      >
        {() => <NavigationPage title="Reset password" />}
      </Patient.Screen>
    </Patient.Navigator>
  );
}
export function StaffAuthNavigator({
  onStaffAuthenticated,
}: {
  onStaffAuthenticated: (session: import('./types').NavigationSession) => void;
}) {
  return (
    <Staff.Navigator screenOptions={stackOptions}>
      <Staff.Screen
        name="StaffSignIn"
        options={{ title: 'Staff sign in', headerShown: false }}
      >
        {props => (
          <StaffSignInScreen
            {...props}
            onAuthenticated={onStaffAuthenticated}
          />
        )}
      </Staff.Screen>
      <Staff.Screen
        name="StaffRegistration"
        component={StaffRegistrationScreen}
        options={{ title: 'Staff registration', headerShown: false }}
      />
      <Staff.Screen
        name="StaffVerification"
        options={{ title: 'Staff verification' }}
      >
        {() => <NavigationPage title="Staff verification" />}
      </Staff.Screen>
      <Staff.Screen name="ResetPassword" options={{ title: 'Reset password' }}>
        {() => <NavigationPage title="Reset password" />}
      </Staff.Screen>
    </Staff.Navigator>
  );
}
