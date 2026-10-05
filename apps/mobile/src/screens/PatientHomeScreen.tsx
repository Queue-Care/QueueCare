import React from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { colors, surfaces } from '../theme/tokens';
import { InterfaceIcon } from '../components/InterfaceIcon';
import { useHomeFonts } from '../theme/homeFonts';
import type { PatientSummary } from '../navigation/types';

export type PatientHomeProps = {
  guest: boolean;
  accessToken?: string;
  patient?: PatientSummary;
  onProfile?: () => void;
  onPriority?: () => void;
  onExit?: () => void;
  onSignIn: () => void;
  onSearch: () => void;
  onBookings: () => void;
  onAlerts: () => void;
  onViewBooking: (bookingId: string) => void;
};

export function PatientHomeScreen({
  guest,
  accessToken,
  patient,
  onProfile,
  onPriority,
  onExit,
  onSignIn,
  onSearch,
  onBookings,
  onAlerts,
  onViewBooking,
}: PatientHomeProps) {
  const { state, reload } = useNextAppointment(!guest, accessToken);
  const homeFonts = useHomeFonts();
  const fullName = guest ? 'Welcome to QueueCare' : patient?.fullName.trim() || 'Welcome';
  const names = patient?.fullName.trim().split(/\s+/).filter(Boolean) || [];
  const initials = names.length ? (names[0][0] + (names.length > 1 ? names[names.length - 1][0] : '')).toUpperCase() : 'P';
  const tiles = [
    { label: 'Find a hospital', icon: 'Location', onPress: onSearch },
    { label: 'My bookings', icon: 'Bookings', onPress: guest ? onSignIn : onBookings },
    { label: 'Priority queue', icon: 'Priority', onPress: guest ? onSignIn : onPriority ?? onBookings, coral: true },
    { label: 'Notifications', icon: 'Alerts', onPress: guest ? onSignIn : onAlerts },
  ];
  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
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
        <View style={styles.header}>
          {guest && onExit ? <Pressable accessibilityRole="button" accessibilityLabel="Back to welcome" onPress={onExit} hitSlop={5}><Text style={styles.back}>?</Text></Pressable> : null}
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open notifications" onPress={guest ? onSignIn : onAlerts} style={styles.notification} hitSlop={5}>
              <View style={{ transform: [{ scale: 0.75 }] }}><InterfaceIcon name="Alerts" color={colors.tealDark} /></View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={guest ? 'Patient sign in' : 'Open profile'} onPress={guest ? onSignIn : onProfile ?? onBookings} style={styles.avatar} hitSlop={5}>
              <Text style={[styles.initials, { fontFamily: homeFonts.bold }]}>{guest ? 'G' : initials}</Text>
            </Pressable>
          </View>
        </View>
        <Text style={[styles.greeting, { fontFamily: homeFonts.body }]}>Good morning,</Text>
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: homeFonts.display }]}>{fullName}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Search hospitals" accessibilityHint="Search hospitals or clinics" onPress={onSearch} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
          <View style={{ transform: [{ scale: 0.67 }] }}><InterfaceIcon name="Search" color="#9CB0AA" /></View>
          <Text style={[styles.searchLabel, { fontFamily: homeFonts.body }]}>Search hospitals or clinics</Text>
        </Pressable>
        <View>
          {guest ? (
            <View style={styles.card}>
              <Text style={[styles.ticketLabel, { fontFamily: homeFonts.semibold }]}>Next appointment</Text>
              <Text style={[styles.cardTitle, { fontFamily: homeFonts.display }]}>Your visits, in one place</Text>
              <Text style={[styles.description, { fontFamily: homeFonts.body }]}>
                Sign in to see your next appointment and manage your bookings.
              </Text>
              <ActionButton
                label="Patient sign in"
                onPress={onSignIn}
                variant="onDark"
              />
            </View>
          ) : state.status === 'loading' ? (
            <View style={styles.card}>
              <Text style={[styles.ticketLabel, { fontFamily: homeFonts.semibold }]}>Next appointment</Text>
              <ActivityIndicator
                color={colors.teal}
                accessible={false}
                importantForAccessibility="no"
              />
              <StatusText
                style={[styles.description, { fontFamily: homeFonts.body }]}
                accessibilityState={{ busy: true }}
              >
                Loading your next appointment…
              </StatusText>
            </View>
          ) : state.status === 'error' ? (
            <View style={styles.card}>
              <Text style={[styles.ticketLabel, { fontFamily: homeFonts.semibold }]}>Next appointment</Text>
              <StatusText
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[styles.cardTitle, { fontFamily: homeFonts.display }]}
              >
                We couldn’t load your appointment
              </StatusText>
              <Text style={[styles.description, { fontFamily: homeFonts.body }]}>
                Please try again. You can still explore hospitals below.
              </Text>
              <ActionButton
                label="Try again"
                onPress={reload}
                variant="onDark"
              />
            </View>
          ) : state.appointment ? (
            <NextAppointmentCard
              appointment={state.appointment}
              onView={onViewBooking}
            />
          ) : (
            <View style={styles.card}>
              <Text style={[styles.ticketLabel, { fontFamily: homeFonts.semibold }]}>Next appointment</Text>
              <StatusText style={[styles.cardTitle, { fontFamily: homeFonts.display }]}>
                No upcoming appointments
              </StatusText>
              <Text style={[styles.description, { fontFamily: homeFonts.body }]}>
                When you book an OPD visit, its details will appear here.
              </Text>
            </View>
          )}
        </View>
        <Text accessibilityRole="header" style={[styles.heading, { fontFamily: homeFonts.bold }]}>Quick actions</Text>
        <View style={styles.tiles}>
          {tiles.map(tile => <Pressable key={tile.label} accessibilityRole="button" accessibilityLabel={tile.label} accessibilityHint={guest && tile.icon !== 'Location' ? 'Sign in to continue' : undefined} onPress={tile.onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
            <View style={[styles.tileIcon, tile.coral && styles.coralIcon]}><InterfaceIcon name={tile.icon} color={tile.coral ? '#A7402C' : colors.tealDark} /></View>
            <Text style={[styles.tileLabel, { fontFamily: homeFonts.semibold }]}>{tile.label}</Text>
          </Pressable>)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: { ...surfaces.content, flexGrow: 1, paddingHorizontal: 22, paddingBottom: 22 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingBottom: 14, minHeight: 58 },
  headerActions: { marginLeft: 'auto', flexDirection: 'row', gap: 10 },
  notification: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.sageLine, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.tealTint, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.tealDark, fontSize: 13.12, fontWeight: '700' },
  back: { color: colors.tealDark, fontSize: 30 },
  greeting: { color: colors.inkSoft, fontSize: 14.08, lineHeight: 21 },
  title: { color: colors.tealDark, fontSize: 29.6, lineHeight: 34.04, fontWeight: '600', letterSpacing: -0.2, marginBottom: 14 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, minHeight: 47, borderWidth: 1, borderColor: colors.sageLine, borderRadius: 999, backgroundColor: colors.panel, marginBottom: 14 },
  searchLabel: { color: '#9CB0AA', fontSize: 14.4, flexShrink: 1 },
  card: { backgroundColor: colors.tealDark, borderRadius: 16, padding: 20, overflow: 'hidden', marginBottom: 12, minHeight: 163, gap: 6 },
  ticketLabel: { color: colors.ticketMuted, fontSize: 11.52, fontWeight: '600', lineHeight: 17 },
  cardTitle: { color: colors.panel, fontSize: 25, lineHeight: 30, marginTop: 4 },
  description: { color: colors.ticketMuted, fontSize: 13.6, lineHeight: 20, marginTop: 6 },
  heading: { color: colors.ink, fontSize: 13.12, lineHeight: 20, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.sageLine, borderRadius: 14, padding: 15, gap: 10 },
  tileIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.tealTint, alignItems: 'center', justifyContent: 'center' },
  coralIcon: { backgroundColor: colors.coralTint },
  tileLabel: { color: colors.ink, fontSize: 14.08, lineHeight: 17.6, fontWeight: '600' },
  pressed: { opacity: 0.75 },
});
