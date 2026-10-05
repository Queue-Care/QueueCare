import React from 'react';
import { StyleSheet, View } from 'react-native';

/** The faint circle on the HTML ticket; decorative and noninteractive. */
export function TicketAccent() {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.accent}
    />
  );
}
const styles = StyleSheet.create({
  accent: {
    position: 'absolute',
    right: -42,
    top: -42,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
});
