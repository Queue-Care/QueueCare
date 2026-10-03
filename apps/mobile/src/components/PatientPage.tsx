import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from './ActionButton';
import { colors, fonts } from '../theme/tokens';

export function PatientPage({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView
      style={patientStyles.page}
      edges={['bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={patientStyles.content}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={patientStyles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkSoft}
        style={[
          patientStyles.input,
          error ? { borderColor: colors.coral } : undefined,
        ]}
        {...props}
      />
      {error ? (
        <Text accessibilityRole="alert" style={patientStyles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={patientStyles.small}>{hint}</Text>
      ) : null}
    </View>
  );
}
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <View style={patientStyles.note}>
      <Text style={patientStyles.text}>{children}</Text>
    </View>
  );
}
export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={patientStyles.row}>
      <Text style={patientStyles.small}>{label}</Text>
      <Text
        style={[
          patientStyles.text,
          { flex: 1, textAlign: 'right', fontWeight: '600' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: string;
  retry: () => void;
}) {
  if (loading)
    return (
      <View style={patientStyles.card}>
        <ActivityIndicator color={colors.teal} />
        <Text style={patientStyles.text}>Loading your details…</Text>
      </View>
    );
  if (error)
    return (
      <View style={patientStyles.card}>
        <Text accessibilityRole="alert" style={patientStyles.text}>
          {error}
        </Text>
        <ActionButton label="Try again" onPress={retry} variant="outline" />
      </View>
    );
  return null;
}
export const patientStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    flexGrow: 1,
    padding: 24,
    gap: 18,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 38,
    color: colors.ink,
  },
  heading: { fontFamily: fonts.display, fontSize: 21, color: colors.ink },
  text: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkSoft,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 19,
    color: colors.inkSoft,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: 12,
    backgroundColor: colors.panel,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 20,
    backgroundColor: colors.panel,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    justifyContent: 'space-between',
  },
  note: { backgroundColor: colors.tealTint, borderRadius: 12, padding: 16 },
  error: { color: '#A53727', fontSize: 13, lineHeight: 20 },
  badge: {
    color: colors.tealDark,
    backgroundColor: colors.tealTint,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },
  ticket: {
    borderRadius: 20,
    backgroundColor: colors.teal,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  ticketCode: {
    color: colors.panel,
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: 1,
  },
  divider: { height: 1, backgroundColor: colors.sageLine },
});
