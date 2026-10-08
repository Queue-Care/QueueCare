import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Text } from '../i18n/g_Text';
import { useT } from '../i18n/g_language';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from './ActionButton';
import {
  colors,
  radii,
  fonts,
  spacing,
  surfaces,
  typography,
  ticketStyles,
} from '../theme/tokens';

export function PatientPage({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
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
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.teal}
              />
            ) : undefined
          }
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
  const t = useT();
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
        placeholder={props.placeholder && t(props.placeholder)}
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
      <Text style={[patientStyles.text, { color: colors.tealDark }]}>
        {children}
      </Text>
    </View>
  );
}
export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={patientStyles.detailRow}>
      <Text style={[patientStyles.small, { fontWeight: '600' }]}>{label}</Text>
      <Text
        style={[patientStyles.text, { color: colors.ink, fontWeight: '500' }]}
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
    ...surfaces.content,
    flexGrow: 1,
    padding: spacing.lg,
    gap: 16,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  detailRow: { gap: 2, alignItems: 'stretch' },
  title: typography.title,
  heading: typography.heading,
  text: typography.body,
  small: typography.meta,
  label: typography.label,
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: radii.sm,
    backgroundColor: colors.panel,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  card: {
    ...surfaces.card,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    justifyContent: 'space-between',
  },
  note: {
    backgroundColor: colors.tealTint,
    borderRadius: radii.note,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  error: {
    fontFamily: fonts.body,
    color: colors.coralStrong,
    fontSize: 13,
    lineHeight: 20,
  },
  badge: {
    fontFamily: fonts.body,
    color: colors.tealDark,
    backgroundColor: colors.tealTint,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    fontSize: 12,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },
  ticketLabel: ticketStyles.label,
  ticketText: ticketStyles.text,
  ticketLine: ticketStyles.divider,
  ticket: {
    ...ticketStyles.panel,
    borderRadius: radii.lg,
    backgroundColor: colors.tealDark,
    padding: 20,
    alignItems: 'flex-start',
    gap: 12,
  },
  ticketCode: {
    ...ticketStyles.identifier,
    fontSize: 20,
    lineHeight: 30,
    flexShrink: 1,
  },
  divider: { height: 1, backgroundColor: colors.sageLine },
});
