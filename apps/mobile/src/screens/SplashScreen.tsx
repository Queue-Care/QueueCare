import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandMark } from '../components/BrandMark';
import { ActionButton } from '../components/ActionButton';
import { colors, fonts, spacing } from '../theme/tokens';

type Props =
  | { error?: false }
  | { error: true; onRetry: () => void; onContinue: () => void };

export function SplashScreen(props: Props) {
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <BrandMark inverse />
          <Text accessibilityRole="header" style={styles.title}>
            QueueCare
          </Text>
          <Text style={styles.tagline}>
            A little less waiting.{'\n'}A little more care.
          </Text>
        </View>
        {props.error ? (
          <View style={styles.status}>
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.statusText}
            >
              We couldn’t open your account. Please try again, or continue
              without signing in.
            </Text>
            <ActionButton
              label="Try again"
              onPress={props.onRetry}
              variant="onDark"
            />
            <ActionButton
              label="Continue without signing in"
              onPress={props.onContinue}
              variant="onDark"
            />
          </View>
        ) : (
          <View
            style={styles.status}
            accessible
            accessibilityLabel="Opening QueueCare"
            accessibilityState={{ busy: true }}
          >
            <ActivityIndicator color={colors.panel} size="small" />
            <Text style={styles.statusText}>Getting things ready…</Text>
          </View>
        )}
        <Text style={styles.footer}>Government hospital OPD appointments</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.tealDark },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xxl,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: spacing.lg },
  title: {
    fontFamily: fonts.display,
    fontSize: 38,
    color: colors.panel,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.tealTint,
    textAlign: 'center',
  },
  status: { gap: spacing.md, width: '100%' },
  statusText: {
    fontFamily: fonts.body,
    color: colors.panel,
    fontSize: 16,
    lineHeight: 25,
    textAlign: 'center',
  },
  footer: {
    fontFamily: fonts.body,
    color: colors.tealTint,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
