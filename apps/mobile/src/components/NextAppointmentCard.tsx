import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NextAppointment } from '../features/home/nextAppointment';
import { colors, fonts, radii, spacing, surfaces, ticketStyles } from '../theme/tokens';
import { ActionButton } from './ActionButton';
import { StatusText } from './StatusText';
import { TicketAccent } from './TicketAccent';

export function NextAppointmentCard({
  appointment,
  onView,
}: {
  appointment: NextAppointment;
  onView: (bookingId: string) => void;
}) {
  const date = new Date(appointment.startsAt);
  const day = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Colombo',
  });
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Colombo',
  });
  return (
    <View style={styles.card}>
      <TicketAccent />
      <StatusText style={styles.badge}>Next appointment confirmed</StatusText>
      <Text style={styles.hospital}>{appointment.hospitalName}</Text>
      <Text style={styles.detail}>{appointment.serviceName}</Text>
      <View style={styles.schedule}>
        <Text style={styles.day}>{day}</Text>
        <Text style={styles.detail}>{time} · Sri Lanka time</Text>
      </View>
      <Text style={styles.identifier}>Booking {appointment.bookingCode}</Text>
      <ActionButton
        label="View booking"
        variant="onDark"
        onPress={() => onView(appointment.bookingId)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  identifier: ticketStyles.identifier,
  card: {
    ...ticketStyles.panel,
    ...surfaces.card,
    backgroundColor: colors.tealDark,
    borderWidth: 1,
    borderColor: colors.tealDark,
    borderRadius: radii.lg,
    padding: 20,
    gap: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    color: colors.tealDark,
    backgroundColor: colors.tealTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  hospital: {
    color: colors.panel,
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  detail: {
    color: colors.ticketMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 24,
  },
  schedule: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  day: {
    color: colors.panel,
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '600',
  },
});
