import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NextAppointment } from '../features/home/nextAppointment';
import { colors, fonts, radii, spacing } from '../theme/tokens';
import { ActionButton } from './ActionButton';
import { StatusText } from './StatusText';

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
      <StatusText style={styles.badge}>Next appointment confirmed</StatusText>
      <Text style={styles.hospital}>{appointment.hospitalName}</Text>
      <Text style={styles.detail}>{appointment.serviceName}</Text>
      <View style={styles.schedule}>
        <Text style={styles.day}>{day}</Text>
        <Text style={styles.detail}>{time} · Sri Lanka time</Text>
      </View>
      <Text style={styles.detail}>Booking {appointment.bookingCode}</Text>
      <ActionButton
        label="View booking"
        onPress={() => onView(appointment.bookingId)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    color: colors.tealDark,
    backgroundColor: colors.tealTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  hospital: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  detail: {
    color: colors.inkSoft,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 24,
  },
  schedule: {
    borderTopWidth: 1,
    borderTopColor: colors.sageLine,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  day: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '600',
  },
});
