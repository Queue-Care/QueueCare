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
import { ActionButton } from '../components/ActionButton';
import { colors, fonts } from '../theme/tokens';

export function WelcomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParams, 'Welcome'>) {
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ flex: 1, minHeight: 28 }} />
        <View style={styles.introduction}>
          <View
            style={styles.mark}
            accessible={false}
            accessibilityElementsHidden
          >
            <View style={styles.calendar}>
              <View style={styles.calendarLine} />
              <View style={[styles.ring, { left: 8 }]} />
              <View style={[styles.ring, { right: 8 }]} />
              <Text style={styles.cross}>+</Text>
            </View>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            Book your OPD visit{'\n'}without the queue
          </Text>
          <Text style={styles.description}>
            Find a government hospital, pick an available session, and track
            your place in line from your phone.
          </Text>
        </View>
        <View style={{ flex: 1, minHeight: 40 }} />
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
            style={({ pressed }) => [styles.guest, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.link}>Continue without signing in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    flexGrow: 1,
    padding: 24,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  introduction: { alignItems: 'center', gap: 22 },
  mark: {
    width: 96,
    height: 96,
    backgroundColor: colors.tealTint,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendar: {
    width: 40,
    height: 37,
    borderWidth: 2,
    borderColor: colors.teal,
    borderRadius: 6,
  },
  calendarLine: {
    position: 'absolute',
    top: 9,
    height: 2,
    backgroundColor: colors.teal,
    width: '100%',
  },
  ring: {
    position: 'absolute',
    top: -7,
    height: 12,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.teal,
  },
  cross: {
    position: 'absolute',
    top: 7,
    alignSelf: 'center',
    color: colors.teal,
    fontSize: 27,
    lineHeight: 30,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 40,
    color: colors.ink,
    textAlign: 'center',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25,
    color: colors.inkSoft,
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: { gap: 12 },
  guest: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 14, fontWeight: '600', color: colors.teal },
});
