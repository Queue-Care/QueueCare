import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme/tokens';

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?:
    | 'primary'
    | 'outline'
    | 'onDark'
    | 'urgent'
    | 'secondary'
    | 'danger';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !disabled && !busy && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.label,
          ['outline', 'onDark', 'secondary'].includes(variant) &&
            styles.darkLabel,
          variant === 'danger' && { color: colors.coralStrong },
          (disabled || busy) && styles.disabledLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    minWidth: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: { backgroundColor: colors.teal, borderColor: colors.teal },
  outline: { backgroundColor: colors.panel, borderColor: colors.controlBorder },
  onDark: { backgroundColor: colors.panel, borderColor: colors.panel },
  secondary: {
    backgroundColor: colors.tealTint,
    borderColor: colors.controlBorder,
  },
  urgent: {
    backgroundColor: colors.coralStrong,
    borderColor: colors.coralStrong,
  },
  danger: {
    backgroundColor: colors.coralTint,
    borderColor: colors.coralStrong,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.panel,
  },
  darkLabel: { color: colors.tealDark },
  pressed: { borderColor: colors.ink, borderWidth: 2 },
  disabled: {
    backgroundColor: colors.canvas,
    borderColor: colors.controlBorder,
  },
  disabledLabel: { color: colors.inkSoft },
});
