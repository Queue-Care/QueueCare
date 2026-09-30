import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii, spacing } from '../theme/tokens';

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'onDark';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, variant !== 'primary' && styles.darkLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: { backgroundColor: colors.teal, borderColor: colors.teal },
  outline: { backgroundColor: colors.panel, borderColor: colors.sage },
  onDark: { backgroundColor: colors.panel, borderColor: colors.panel },
  label: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.panel,
  },
  darkLabel: { color: colors.tealDark },
  pressed: { opacity: 0.78 },
});
