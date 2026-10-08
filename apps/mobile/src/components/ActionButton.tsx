import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../i18n/g_Text';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { InterfaceIcon } from './InterfaceIcon';

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityHint,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?:
    | 'primary'
    | 'outline'
    | 'quiet'
    | 'onDark'
    | 'urgent'
    | 'secondary'
    | 'danger'
    | 'tile';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
  icon?: string;
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
        pressed &&
          !disabled &&
          !busy &&
          variant === 'quiet' &&
          styles.quietPressed,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {icon ? (
        <View style={styles.icon}>
          <InterfaceIcon name={icon} color={colors.tealDark} />
        </View>
      ) : null}
      <Text
        style={[
          styles.label,
          ['outline', 'quiet', 'onDark', 'secondary', 'tile'].includes(
            variant,
          ) && styles.darkLabel,
          variant === 'danger' && { color: colors.coralStrong },
          variant === 'tile' && styles.tileLabel,
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
    paddingVertical: 14,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: { backgroundColor: colors.teal, borderColor: colors.teal },
  tile: {
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    borderColor: colors.sageLine,
    alignItems: 'flex-start',
    padding: 15,
    gap: 10,
    flex: 1,
    minWidth: 130,
  },
  tileLabel: { fontSize: 14, textAlign: 'left' },
  icon: {
    borderRadius: radii.icon,
    width: 38,
    height: 38,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: { backgroundColor: colors.panel, borderColor: colors.sage },
  // Lower-emphasis action whose outline still meets 3:1 non-text contrast.
  quiet: { backgroundColor: colors.panel, borderColor: colors.controlBorder },
  quietPressed: { backgroundColor: colors.tealTint },
  onDark: { backgroundColor: colors.panel, borderColor: colors.panel },
  secondary: {
    backgroundColor: colors.tealTint,
    borderColor: colors.tealTint,
  },
  urgent: {
    backgroundColor: colors.coralStrong,
    borderColor: colors.coralStrong,
  },
  danger: {
    backgroundColor: colors.panel,
    borderColor: colors.coralTint,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.panel,
  },
  darkLabel: { color: colors.tealDark },
  pressed: { borderColor: colors.ink },
  disabled: {
    backgroundColor: colors.canvas,
    borderColor: colors.controlBorder,
  },
  disabledLabel: { color: colors.inkSoft },
});
