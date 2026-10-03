import React from 'react';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { NavigationPage, stackOptions } from './NavigationPage';
import type { PatientAuthParams, StaffAuthParams } from './types';
import { CreateAccountScreen } from '../screens/CreateAccountScreen';

const Patient = createNativeStackNavigator<PatientAuthParams>();
const Staff = createNativeStackNavigator<StaffAuthParams>();

function PatientSignIn({
  navigation,
}: NativeStackScreenProps<PatientAuthParams, 'PatientSignIn'>) {
  return (
    <NavigationPage
      title="Patient sign in"
      description="Patient sign-in will be available here."
      actions={[
        {
          label: 'Create an account',
          onPress: () => navigation.navigate('PatientCreateAccount'),
        },
        {
          label: 'Forgot password?',
          onPress: () => navigation.navigate('ResetPassword'),
        },
      ]}
    />
  );
}
function StaffSignIn({
  navigation,
}: NativeStackScreenProps<StaffAuthParams, 'StaffSignIn'>) {
  return (
    <NavigationPage
      title="Staff sign in"
      description="Staff sign-in will be available here."
      actions={[
        {
          label: 'Register as staff',
          onPress: () => navigation.navigate('StaffRegistration'),
        },
        {
          label: 'Forgot password?',
          onPress: () => navigation.navigate('ResetPassword'),
        },
      ]}
    />
  );
}

export function PatientAuthNavigator() {
  return (
    <Patient.Navigator screenOptions={stackOptions}>
      <Patient.Screen
        name="PatientSignIn"
        component={PatientSignIn}
        options={{ title: 'Patient sign in' }}
      />
      <Patient.Screen
        name="PatientCreateAccount"
        options={{ title: 'Create account' }}
        component={CreateAccountScreen}
      />
      <Patient.Screen name="VerifyMobile" options={{ title: 'Verify mobile' }}>
        {() => <NavigationPage title="Verify mobile" />}
      </Patient.Screen>
      <Patient.Screen
        name="ResetPassword"
        options={{ title: 'Reset password' }}
      >
        {() => <NavigationPage title="Reset password" />}
      </Patient.Screen>
    </Patient.Navigator>
  );
}
export function StaffAuthNavigator() {
  return (
    <Staff.Navigator screenOptions={stackOptions}>
      <Staff.Screen
        name="StaffSignIn"
        component={StaffSignIn}
        options={{ title: 'Staff sign in' }}
      />
      <Staff.Screen
        name="StaffRegistration"
        options={{ title: 'Staff registration' }}
      >
        {() => <NavigationPage title="Staff registration" />}
      </Staff.Screen>
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
