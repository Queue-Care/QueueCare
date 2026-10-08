import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import { useHomeFonts } from '../theme/homeFonts';
import { useT } from '../i18n/g_language';

export function SessionToast({ message, kind = 'success', onDismiss }: {
  message?: string; kind?: 'success' | 'error'; onDismiss: () => void;
}) {
  const fonts = useHomeFonts();
  const t = useT();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 2500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message) return null;
  return <View pointerEvents="none" accessible accessibilityRole="alert" accessibilityLiveRegion="polite"
    accessibilityLabel={kind === 'error' ? `${message}. Check your connection and try again.` : message}
    style={[styles.toast, kind === 'error' ? styles.error : styles.success]}>
    <Text style={[styles.title, kind === 'success' && styles.successTitle, { fontFamily: fonts.semibold }]}>
      {kind === 'success' ? '\u2713 ' : '! '}{message}
    </Text>
    {kind === 'error' ? <Text style={[styles.detail, { fontFamily: fonts.body }]}>{t('Check your connection and try again.')}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  toast: { alignSelf: 'flex-end', maxWidth: '85%', marginHorizontal: 22, marginVertical: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.md,
    backgroundColor: colors.tealTint, borderWidth: 1, borderColor: colors.teal },
  error: { backgroundColor: colors.coralTint, borderColor: colors.coralStrong },
  success: { backgroundColor: colors.amber, borderColor: colors.amber },
  successTitle: { color: '#FFFFFF' },
  title: { color: colors.ink, fontSize: 14 },
  detail: { color: colors.ink, fontSize: 13, marginTop: 3 },
});
