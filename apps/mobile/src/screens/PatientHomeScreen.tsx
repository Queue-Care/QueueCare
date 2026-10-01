import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { NextAppointmentCard } from '../components/NextAppointmentCard';
import { useNextAppointment } from '../features/home/useNextAppointment';
import { colors, fonts, radii, spacing } from '../theme/tokens';

export type PatientHomeProps = {
  guest: boolean;
  accessToken?: string;
  onSignIn: () => void;
  onSearch: () => void;
  onBookings: () => void;
  onAlerts: () => void;
  onViewBooking: (bookingId: string) => void;
};

export function PatientHomeScreen({
  guest,
  accessToken,
  onSignIn,
  onSearch,
  onBookings,
  onAlerts,
  onViewBooking,
}: PatientHomeProps) {
  const { state, reload } = useNextAppointment(!guest, accessToken);
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          guest ? undefined : (
            <RefreshControl
              refreshing={state.status === 'loading'}
              onRefresh={reload}
              tintColor={colors.teal}
            />
          )
        }
      >
        <View style={styles.introduction}>
          <Text style={styles.eyebrow}>YOUR OPD VISIT</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Welcome to QueueCare
          </Text>
          <Text style={styles.description}>
            Plan your visit. Keep your appointment close.
          </Text>
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>
            Your next appointment
          </Text>
          {guest ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your visits, in one place</Text>
              <Text style={styles.description}>
                Sign in to see your next appointment and manage your bookings.
              </Text>
              <ActionButton
                label="Patient sign in"
                onPress={onSignIn}
                variant="outline"
              />
            </View>
          ) : state.status === 'loading' ? (
            <View
              style={styles.card}
              accessible
              accessibilityLabel="Loading next appointment"
              accessibilityState={{ busy: true }}
            >
              <ActivityIndicator color={colors.teal} />
              <Text style={styles.description}>
                Loading your next appointment…
              </Text>
            </View>
          ) : state.status === 'error' ? (
            <View style={styles.card}>
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={styles.cardTitle}
              >
                We couldn’t load your appointment
              </Text>
              <Text style={styles.description}>
                Please try again. You can still explore hospitals below.
              </Text>
              <ActionButton
                label="Try again"
                onPress={reload}
                variant="outline"
              />
            </View>
          ) : state.appointment ? (
            <NextAppointmentCard
              appointment={state.appointment}
              onView={onViewBooking}
            />
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No upcoming appointments</Text>
              <Text style={styles.description}>
                When you book an OPD visit, its details will appear here.
              </Text>
            </View>
          )}
        </View>
        <View style={styles.searchCard}>
          <Text accessibilityRole="header" style={styles.heading}>
            Find your next OPD visit
          </Text>
          <Text style={styles.description}>
            Search for a hospital and explore its available sessions.
          </Text>
          <ActionButton label="Search hospitals" onPress={onSearch} />
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>
            Quick actions
          </Text>
          <ActionButton
            label="My bookings"
            onPress={guest ? onSignIn : onBookings}
            variant="outline"
          />
          <ActionButton
            label="Notifications"
            onPress={guest ? onSignIn : onAlerts}
            variant="outline"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  introduction: { gap: spacing.sm },
  eyebrow: {
    color: colors.teal,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 1,
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 40,
  },
  heading: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '600',
  },
  description: {
    color: colors.inkSoft,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25,
  },
  section: { gap: spacing.md },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
  },
  searchCard: {
    backgroundColor: colors.tealTint,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
