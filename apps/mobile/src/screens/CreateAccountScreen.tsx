import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PatientAuthParams } from '../navigation/types';
import {
  Field,
  Note,
  PatientPage,
  patientStyles as s,
} from '../components/PatientPage';
import { ActionButton } from '../components/ActionButton';
import { PasswordField } from '../components/g_PasswordField';
import { message, patientApi, PatientApiError } from '../features/patient/api';

export type Registration = {
  fullName: string;
  nic: string;
  mobile: string;
  email: string;
  password: string;
  confirmPassword: string;
};
export function validateRegistration(values: Registration) {
  const errors: Partial<Record<keyof Registration, string>> = {};
  if (values.fullName.trim().length < 2)
    errors.fullName = 'Enter your full name.';
  if (!/^(\d{12}|\d{9}[VX])$/i.test(values.nic.trim()))
    errors.nic = 'Enter a valid 12-digit NIC or 9 digits followed by V or X.';
  if (!/^(?:0|\+94|94)7\d{8}$/.test(values.mobile.replace(/[\s()-]/g, '')))
    errors.mobile = 'Enter a valid Sri Lankan mobile number.';
  if (
    values.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
  )
    errors.email = 'Enter a valid email address or leave this blank.';
  if (values.password.length < 8)
    errors.password = 'Use at least 8 characters.';
  if (!values.confirmPassword)
    errors.confirmPassword = 'Confirm your password.';
  else if (values.confirmPassword !== values.password)
    errors.confirmPassword = 'Passwords do not match.';
  return errors;
}
export function CreateAccountScreen({
  navigation,
}: NativeStackScreenProps<PatientAuthParams, 'PatientCreateAccount'>) {
  const [values, setValues] = useState<Registration>({
    fullName: '',
    nic: '',
    mobile: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof Registration, string>>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit() {
    if (busy) return;
    const validation = validateRegistration(values);
    setErrors(validation);
    setError(undefined);
    if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      const result = await patientApi('/auth/patient/register', {
        public: true,
        method: 'POST',
        body: {
          fullName: values.fullName.trim(),
          nic: values.nic.trim().toUpperCase(),
          mobile: values.mobile.replace(/[\s()-]/g, ''),
          ...(values.email.trim() ? { email: values.email.trim() } : {}),
          password: values.password,
        },
      });
      if (
        typeof result !== 'object' ||
        result === null ||
        !('registered' in result) ||
        result.registered !== true
      )
        throw new PatientApiError(
          'We could not create your account. Please try again.',
        );
      navigation.reset({
        index: 0,
        routes: [{ name: 'PatientSignIn', params: { registered: true } }],
      });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  const update = (key: keyof Registration) => (value: string) => {
    setValues(current => ({ ...current, [key]: value }));
    setErrors(current => ({
      ...current,
      [key]: undefined,
      ...(key === 'password' ? { confirmPassword: undefined } : {}),
    }));
  };
  return (
    <PatientPage>
      <Text style={s.text}>
        Your NIC links this account to your hospital records.
      </Text>
      <Field
        label="Full name"
        value={values.fullName}
        onChangeText={update('fullName')}
        error={errors.fullName}
        placeholder="Kasun Perera"
        autoComplete="name"
        editable={!busy}
      />
      <Field
        label="NIC number"
        value={values.nic}
        onChangeText={update('nic')}
        error={errors.nic}
        placeholder="200145601234"
        autoCapitalize="characters"
        maxLength={12}
        editable={!busy}
      />
      <Field
        label="Mobile number"
        value={values.mobile}
        onChangeText={update('mobile')}
        error={errors.mobile}
        placeholder="+94 77 123 4567"
        keyboardType="phone-pad"
        autoComplete="tel"
        hint="Your contact number for hospital services."
        editable={!busy}
      />
      <Field
        label="Email address"
        value={values.email}
        onChangeText={update('email')}
        error={errors.email}
        placeholder="Optional"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!busy}
      />
      <PasswordField
        label="Create password"
        value={values.password}
        onChangeText={update('password')}
        error={errors.password}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        hint="At least 8 characters."
        editable={!busy}
      />
      <PasswordField
        label="Confirm password"
        value={values.confirmPassword}
        onChangeText={update('confirmPassword')}
        error={errors.confirmPassword}
        placeholder="Re-enter your password"
        autoComplete="new-password"
        editable={!busy}
      />
      <Note>
        Creating an account means you accept the hospital service terms and
        privacy notice.
      </Note>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      <ActionButton
        label={busy ? 'Creating account…' : 'Create account'}
        onPress={submit}
        disabled={busy}
      />
    </PatientPage>
  );
}
