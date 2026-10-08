import React, { useState } from 'react';
import { Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NavigationSession, PatientAuthParams } from '../navigation/types';
import {
  Field,
  PatientPage,
  patientStyles as s,
} from '../components/PatientPage';
import { ActionButton } from '../components/ActionButton';
import { PasswordField } from '../components/g_PasswordField';
import { message, patientApi, PatientApiError } from '../features/patient/api';

type Props = NativeStackScreenProps<PatientAuthParams, 'PatientSignIn'> & {
  onSignedIn?: (session: NavigationSession) => void;
};
export function PatientSignInScreen({ navigation, route, onSignedIn }: Props) {
  const [nic, setNic] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit() {
    if (busy) return;
    if (!/^(\d{12}|\d{9}[VX])$/i.test(nic.trim()) || !password) {
      setError('Enter your NIC number and password.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await patientApi('/auth/patient/login', {
        public: true,
        method: 'POST',
        body: { nic: nic.trim().toUpperCase(), password },
      });
      const session = result as NavigationSession | null;
      if (
        !session ||
        session.role !== 'PATIENT' ||
        typeof session.userId !== 'string' ||
        !/^[a-f\d]{24}$/i.test(session.userId) ||
        typeof session.accessToken !== 'string' ||
        !session.accessToken.trim() ||
        typeof session.patient?.fullName !== 'string' ||
        !session.patient.fullName.trim()
      )
        throw new PatientApiError(
          'We could not sign you in. Please try again.',
        );
      if (!onSignedIn)
        throw new PatientApiError(
          'Sign-in is unavailable. Please restart the app.',
        );
      onSignedIn(session);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <PatientPage>
      {route.params?.registered ? (
        <Text style={s.text}>Account created. Sign in to continue.</Text>
      ) : null}
      <Field
        label="NIC number"
        value={nic}
        onChangeText={setNic}
        autoCapitalize="characters"
        maxLength={12}
        editable={!busy}
      />
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        editable={!busy}
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <ActionButton
        label={busy ? 'Signing in…' : 'Sign in'}
        onPress={submit}
        disabled={busy}
      />
      <ActionButton
        label="Create an account"
        onPress={() => navigation.navigate('PatientCreateAccount')}
        disabled={busy}
      />
      <ActionButton
        label="Forgot password?"
        onPress={() => navigation.navigate('ResetPassword')}
        disabled={busy}
      />
    </PatientPage>
  );
}
