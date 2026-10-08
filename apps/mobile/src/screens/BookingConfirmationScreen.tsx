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
import { TicketAccent } from '../components/TicketAccent';
import { useBookingDetails } from '../features/booking/useBookingDetails';
import {
  bookingDateLabel,
  type BookingDetails,
} from '../features/booking/bookingDetails';
import { sessionTimeLabel } from '../features/booking/availableSessions';
import { colors, fonts, surfaces, radii, spacing, ticketStyles, typography } from '../theme/tokens';

function title(booking: BookingDetails) {
  const labels = {
    CANCELLED: 'Booking cancelled',
    COMPLETED: 'Appointment completed',
    SKIPPED: 'Appointment skipped',
    RESCHEDULED: 'Booking rescheduled',
  };
  if (booking.status !== 'CONFIRMED') return labels[booking.status];
  if (booking.session.status === 'CANCELLED') return 'Session cancelled';
  if (booking.session.status === 'COMPLETED') return 'Session completed';
  if (booking.session.status === 'RUNNING') return 'Session in progress';
  if (Date.parse(booking.session.endsAt) <= Date.now())
    return 'Booking summary';
  return 'Booking confirmed';
}
export function BookingConfirmationScreen({
  bookingId,
  patientId,
  accessToken,
  onViewBooking,
  onHome,
  onSessionExpired,
}: {
  bookingId: string;
  patientId?: string;
  accessToken?: string;
  onViewBooking: (id: string) => void;
  onHome: () => void;
  onSessionExpired?: () => void;
}) {
  const { state, reload } = useBookingDetails(
    bookingId,
    patientId,
    accessToken,
  );
  const booking = state.status === 'ready' ? state.booking : undefined;
  const heading = booking ? title(booking) : '';
  const confirmed = heading === 'Booking confirmed';
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'loading'}
            onRefresh={reload}
            tintColor={colors.teal}
          />
        }
      >
        {state.status === 'loading' ? (
          <View style={styles.panel} accessibilityState={{ busy: true }}>
            <ActivityIndicator
              color={colors.teal}
              accessible={false}
              importantForAccessibility="no"
            />
            <StatusText style={styles.body} accessibilityState={{ busy: true }}>
              Loading your booking…
            </StatusText>
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.panel}>
            <StatusText accessibilityRole="alert" style={styles.heading}>
              {state.kind === 'authentication'
                ? 'Sign in to view your booking'
                : state.kind === 'forbidden'
                ? 'Booking access unavailable'
                : state.kind === 'unavailable'
                ? 'Booking not found'
                : state.kind === 'incomplete'
                ? 'Booking summary unavailable'
                : 'We couldn’t load your booking'}
            </StatusText>
            <Text style={styles.body}>
              {state.kind === 'unavailable'
                ? 'This booking could not be found for your account.'
                : state.kind === 'authentication'
                ? 'Your sign-in has expired or is unavailable. Please sign in again.'
                : state.kind === 'forbidden'
                ? 'Your account cannot access this booking. Please check your account status.'
                : 'Please try again. A problem loading this summary does not cancel your booking.'}
            </Text>
            {['authentication', 'forbidden'].includes(state.kind)
              ? onSessionExpired && (
                  <ActionButton
                    label="Sign in again"
                    onPress={onSessionExpired}
                  />
                )
              : state.kind !== 'unavailable' && (
                  <ActionButton
                    label="Try again"
                    onPress={reload}
                    variant="outline"
                  />
                )}
          </View>
        ) : booking ? (
          <>
            <View style={styles.hero}>
              {confirmed && (
                <View
                  style={styles.mark}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text style={styles.check} accessible={false}>
                    ✓
                  </Text>
                </View>
              )}
              <StatusText accessibilityRole="header" style={styles.title}>
                {heading}
              </StatusText>
              <Text style={styles.body}>
                {confirmed
                  ? 'Show this booking ID at the hospital reception desk.'
                  : 'Review the latest saved booking and session information below.'}
              </Text>
            </View>
            <View style={styles.ticket}>
              <TicketAccent />
              <Text style={styles.ticketLabel}>Booking ID</Text>
              <Text
                selectable
                accessibilityLabel={`Booking ID ${booking.bookingCode}`}
                style={styles.code}
              >
                {booking.bookingCode}
              </Text>
              <View style={styles.line} />
              <Text style={styles.ticketHeading}>{booking.service.name}</Text>
              <Text style={styles.ticketHeading}>{booking.hospital.name}</Text>
              <Text style={styles.ticketText}>{booking.hospital.address}</Text>
              <Text style={styles.ticketText}>{booking.hospital.city}</Text>
              <View style={styles.line} />
              <Text style={styles.ticketText}>
                {bookingDateLabel(booking.session.startsAt)}
              </Text>
              <Text style={styles.ticketHeading}>
                {sessionTimeLabel(booking.session)}
              </Text>
              {booking.assignedTime ? <>
                <Text style={styles.ticketHeading}>
                  Appointment time: {new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(booking.assignedTime))}
                </Text>
                <Text style={styles.ticketText}>Queue type: {booking.queueType === 'PRIORITY' ? 'Priority' : 'Normal'}</Text>
              </> : null}
              <Text style={styles.ticketText}>
                Sri Lanka time (Asia/Colombo)
              </Text>
              <Text style={styles.ticketText}>
                {booking.session.doctorOrTeam}
              </Text>
            </View>
            <View style={styles.panel}>
              <Text style={styles.body}>
                Booking status: {booking.status.replaceAll('_', ' ')}
              </Text>
              <Text style={styles.body}>
                Session status: {booking.session.status}
              </Text>
              {(!booking.hospital.isActive || !booking.service.isActive) && (
                <Text accessibilityRole="alert" style={styles.body}>
                  This hospital or service is no longer listed. Please contact
                  the hospital to confirm arrangements.
                </Text>
              )}
              {booking.session.status === 'CANCELLED' && (
                <Text accessibilityRole="alert" style={styles.body}>
                  This session has been cancelled. Please contact the hospital
                  before travelling.
                </Text>
              )}
            </View>
            <ActionButton
              label="View booking"
              onPress={() => onViewBooking(booking.id)}
            />
          </>
        ) : null}
        <ActionButton label="Back to Home" variant="outline" onPress={onHome} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    ...surfaces.content,
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  hero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  mark: {
    backgroundColor: colors.tealTint,
    borderRadius: radii.mark,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { fontSize: 38, color: colors.teal },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 36,
    color: colors.tealDark,
    textAlign: 'center',
  },
  heading: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
    fontWeight: '600',
  },
  body: typography.body,
  panel: {
    ...surfaces.card,
    backgroundColor: colors.panel,
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.sageLine,
  },
  ticket: {
    ...ticketStyles.panel,
    borderRadius: radii.lg,
    gap: spacing.sm,
  },
  ticketLabel: ticketStyles.label,
  code: {
    ...ticketStyles.identifier,
    color: colors.panel,
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '700',
    flexShrink: 1,
  },
  ticketHeading: {
    fontFamily: fonts.body,
    color: colors.panel,
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '600',
  },
  ticketText: ticketStyles.text,
  line: { ...ticketStyles.divider, marginVertical: spacing.sm },
});
