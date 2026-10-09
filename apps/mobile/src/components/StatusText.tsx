import React, { useCallback } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Platform,
  type TextProps,
} from 'react-native';
import { Text } from '../i18n/g_Text';
import { useFocusEffect } from '@react-navigation/native';

// Android uses a native live region. VoiceOver needs an explicit announcement.
// Coalesce fast responses and cancel speech queued by a screen that loses focus.
export function StatusText({
  children,
  ...props
}: TextProps & { children: string }) {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios' || !children) return;
      const timer = setTimeout(() => {
        if (!['inactive', 'background'].includes(AppState.currentState))
          AccessibilityInfo.announceForAccessibility(children);
      }, 400);
      return () => clearTimeout(timer);
    }, [children]),
  );
  return (
    <Text {...props} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}
