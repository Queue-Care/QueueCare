import React from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParams } from '../navigation/types';
import { BrandMark } from '../components/BrandMark';
import { ActionButton } from '../components/ActionButton';
import { colors, fonts, radii, spacing } from '../theme/tokens';

export function WelcomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParams, 'Welcome'>) {
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <BrandMark />
          <View style={styles.wordmark}>
            <Text style={styles.name}>QueueCare</Text>
            <Text style={styles.eyebrow}>HOSPITAL OPD CARE</Text>
          </View>
        </View>
        <View style={styles.introduction}>
          <Text accessibilityRole="header" style={styles.title}>
            Your visit,{'\n'}made simpler.
          </Text>
          <Text style={styles.description}>
            Plan your hospital visit with care. Find an OPD session, book an
            appointment, and keep track of your queue.
          </Text>
        </View>
        <View style={styles.benefits}>
          <Text style={styles.benefitTitle}>
            Care starts before you arrive.
          </Text>
          <Text style={styles.benefit}>
            Find a hospital that works for you.
          </Text>
          <View style={styles.divider} />
          <Text style={styles.benefit}>
            Keep your appointment details together.
          </Text>
        </View>
        <View style={styles.actions}>
          <ActionButton
            label="Get Started"
            onPress={() =>
              navigation.navigate('ChooseRole', { intent: 'register' })
            }
          />
          <ActionButton
            label="I already have an account"
            variant="outline"
            onPress={() =>
              navigation.navigate('ChooseRole', { intent: 'signIn' })
            }
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue as guest"
            accessibilityHint="Browse hospitals without signing in"
            onPress={() => navigation.navigate('Guest')}
            style={({ pressed }) => [
              styles.guestButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.guestLabel}>Continue as guest</Text>
          </Pressable>
          <Text style={styles.note}>
            You can explore hospitals first. Sign in when you’re ready to book.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    padding: spacing.lg,
    gap: spacing.xl,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  wordmark: { flex: 1, gap: spacing.xs },
  name: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  eyebrow: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 1.2,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  introduction: { gap: spacing.md },
  title: {
    fontFamily: fonts.display,
    fontSize: 42,
    lineHeight: 50,
    color: colors.ink,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 27,
    color: colors.inkSoft,
  },
  benefits: {
    backgroundColor: colors.tealTint,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  benefitTitle: {
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: '600',
    color: colors.tealDark,
    lineHeight: 25,
  },
  benefit: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.inkSoft,
  },
  divider: { height: 1, backgroundColor: colors.sage },
  actions: { gap: spacing.sm },
  guestButton: {
    minHeight: 48,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestLabel: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.teal,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  pressed: { opacity: 0.78 },
});
