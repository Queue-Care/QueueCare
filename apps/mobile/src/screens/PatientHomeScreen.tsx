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
import { StatusText } from '../components/StatusText';
import { NextAppointmentCard } from '../components/NextAppointmentCard';
import { useNextAppointment } from '../features/home/useNextAppointment';
import { colors, fonts, surfaces, radii, spacing } from '../theme/tokens';

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
        <View style={styles.searchCard}>
          <Text accessibilityRole="header" style={styles.heading}>
            Find a hospital
          </Text>
          <Text style={styles.description}>
            Search by hospital name or city, then explore OPD services and
            sessions.
          </Text>
          {guest && (
            <Text style={styles.description}>
              Browse hospitals without signing in. Sign in when you’re ready to
              book.
            </Text>
          )}
          <ActionButton
            label="Search hospitals"
            accessibilityHint="Opens hospital search with name and city filters"
            onPress={onSearch}
          />
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
            <View style={styles.card}>
              <ActivityIndicator
                color={colors.teal}
                accessible={false}
                importantForAccessibility="no"
              />
              <StatusText
                style={styles.description}
                accessibilityState={{ busy: true }}
              >
                Loading your next appointment…
              </StatusText>
            </View>
          ) : state.status === 'error' ? (
            <View style={styles.card}>
              <StatusText
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={styles.cardTitle}
              >
                We couldn’t load your appointment
              </StatusText>
              <Text style={styles.description}>
                Please try again. Hospital search is still available.
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
              <StatusText style={styles.cardTitle}>
                No upcoming appointments
              </StatusText>
              <Text style={styles.description}>
                When you book an OPD visit, its details will appear here.
              </Text>
            </View>
          )}
          {!guest && state.status !== 'loading' && (
            <ActionButton
              label="Refresh appointment"
              variant="outline"
              onPress={reload}
            />
          )}
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>
            Quick actions
          </Text>
          <View style={styles.tiles}>
            <ActionButton
              label="My bookings"
              icon="Bookings"
              accessibilityHint={
                guest ? 'Sign in to view your bookings' : undefined
              }
              onPress={guest ? onSignIn : onBookings}
              variant="tile"
            />
            <ActionButton
              label="Notifications"
              icon="Alerts"
              accessibilityHint={
                guest ? 'Sign in to view your notifications' : undefined
              }
              onPress={guest ? onSignIn : onAlerts}
              variant="tile"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    ...surfaces.content,
    padding: spacing.lg,
    gap: spacing.lg,
    width: '100%',
    maxWidth: 560,
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
    color: colors.tealDark,
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
  },
  heading: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  description: {
    color: colors.inkSoft,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
  },
  section: { gap: spacing.md },
  tiles: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  card: {
    ...surfaces.card,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.md,
    padding: 16,
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  searchCard: {
    backgroundColor: colors.tealTint,
    borderRadius: radii.md,
    padding: 16,
    gap: spacing.md,
  },
});
