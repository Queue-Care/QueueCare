import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  const foreground = inverse ? colors.teal : colors.panel;
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        { backgroundColor: inverse ? colors.panel : colors.teal },
      ]}
    >
      <View style={[styles.horizontal, { backgroundColor: foreground }]} />
      <View style={[styles.vertical, { backgroundColor: foreground }]} />
    </View>
  );
}
const styles = StyleSheet.create({
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontal: { position: 'absolute', width: 30, height: 10, borderRadius: 3 },
  vertical: { position: 'absolute', width: 10, height: 30, borderRadius: 3 },
});
