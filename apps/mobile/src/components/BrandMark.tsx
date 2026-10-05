import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../theme/tokens';

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  const foreground = colors.panel;
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        { backgroundColor: inverse ? 'rgba(255,255,255,0.14)' : colors.teal },
      ]}
    >
      <View style={[styles.horizontal, { backgroundColor: foreground }]} />
      <View style={[styles.vertical, { backgroundColor: foreground }]} />
    </View>
  );
}
const styles = StyleSheet.create({
  mark: {
    width: 92,
    height: 92,
    borderRadius: radii.mark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontal: { position: 'absolute', width: 30, height: 10, borderRadius: 2 },
  vertical: { position: 'absolute', width: 10, height: 30, borderRadius: 2 },
});
