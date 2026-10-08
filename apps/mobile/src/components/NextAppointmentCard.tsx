import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../i18n/g_Text';
import type { NextAppointment } from '../features/home/nextAppointment';
import { colors } from '../theme/tokens';
import { useHomeFonts } from '../theme/homeFonts';
import { InterfaceIcon } from './InterfaceIcon';
import { TicketAccent } from './TicketAccent';

export function NextAppointmentCard({
  appointment,
  onView,
}: {
  appointment: NextAppointment;
  onView: (bookingId: string) => void;
}) {
  const fonts = useHomeFonts();
  const date = new Date(appointment.startsAt);
  const day = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Colombo',
  });
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Colombo',
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View booking"
      accessibilityHint={`${appointment.serviceName}, ${appointment.hospitalName}, ${day} at ${time}. Booking ${appointment.bookingCode}.`}
      onPress={() => onView(appointment.bookingId)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <TicketAccent />
      <Text style={[styles.label, { fontFamily: fonts.semibold }]}>
        Next appointment
      </Text>
      <Text style={[styles.service, { fontFamily: fonts.display }]}>
        {appointment.serviceName}
      </Text>
      <Text style={[styles.hospital, { fontFamily: fonts.body }]}>
        {appointment.hospitalName}
      </Text>
      <View style={styles.divider} />
      <View style={styles.schedule}>
        <View style={styles.clock}>
          <InterfaceIcon name="Clock" color="#EAF4F0" />
        </View>
        <Text style={[styles.when, { fontFamily: fonts.body }]}>
          {day} ? {time}
        </Text>
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.tealDark,
    padding: 20,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  label: {
    color: colors.ticketMuted,
    fontSize: 11.52,
    lineHeight: 17,
    fontWeight: '600',
  },
  service: {
    color: colors.panel,
    fontSize: 33.6,
    lineHeight: 36.96,
    fontWeight: '600',
    marginTop: 4,
  },
  hospital: {
    color: colors.ticketMuted,
    fontSize: 13.6,
    lineHeight: 20,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginVertical: 14,
  },
  schedule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clock: {
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ scale: 0.58 }],
  },
  when: { color: '#EAF4F0', fontSize: 13.76, lineHeight: 21 },
  pressed: { opacity: 0.85 },
});
