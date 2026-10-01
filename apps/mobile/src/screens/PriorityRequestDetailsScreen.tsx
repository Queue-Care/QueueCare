import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

export const PriorityRequestDetailsScreen = ({ route, navigation }: any) => {
  const item = route?.params?.item || {
    name: 'Kasun Perera',
    bookingCode: 'OPD-2026-00481',
    service: 'General OPD',
    session: '24 Sep 2026 · 8:30 AM',
    reason: 'Elderly patient',
    note: '"My father is 78 and cannot stand for long. We will arrive by 8:00 AM."',
  };

  const handleDecision = (decision: 'Accepted' | 'Declined') => {
    Alert.alert(
      `Request ${decision}`,
      `The patient will be notified and the queue will update automatically.`,
      [{ text: 'OK', onPress: () => navigation?.goBack() }]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navHead}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation?.goBack()}
        >
          <Text style={styles.backBtnArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Request details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>KP</Text>
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.patientName}>{item.name}</Text>
              <Text style={styles.patientSub}>NIC ········234V · +94 77 123 4567</Text>
            </View>
            <View style={styles.badgePriority}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgePriorityText}>Pending</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.kv}>
            <Text style={styles.k}>Booking</Text>
            <Text style={[styles.v, styles.mono]}>{item.bookingCode}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.k}>Service</Text>
            <Text style={styles.v}>{item.service}</Text>
          </View>
          <View style={[styles.kv, { marginBottom: 0 }]}>
            <Text style={styles.k}>Session</Text>
            <Text style={styles.v}>{item.session || '24 Sep 2026 · 8:30 AM'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeading}>Reason given</Text>
          <Text style={styles.reasonMain}>{item.reason}</Text>
          <Text style={styles.reasonQuote}>
            {item.note ||
              '"My father is 78 and cannot stand for long. We will arrive by 8:00 AM."'}
          </Text>
        </View>

        <View style={styles.note}>
          <Text style={styles.infoIcon}>ℹ</Text>
          <Text style={styles.noteText}>
            The patient is notified as soon as you decide, and the queue order
            updates immediately.
          </Text>
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => handleDecision('Accepted')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>Accept request</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnDangerGhost}
          onPress={() => handleDecision('Declined')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnDangerGhostText}>Decline request</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.mist,
  },
  navHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  backBtn: {
    width: 38,
    height: 38,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  backBtnArrow: {
    fontSize: 24,
    color: colors.tealDark,
    lineHeight: 28,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.tealDark,
  },
  container: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    backgroundColor: colors.coralTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#A7402C',
  },
  cardHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  patientSub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  badgePriority: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.coralTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    backgroundColor: colors.coral,
    marginRight: 5,
  },
  badgePriorityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A7402C',
  },
  divider: {
    height: 1,
    backgroundColor: colors.sageLine,
    marginVertical: 14,
  },
  kv: {
    marginBottom: 12,
  },
  k: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 2,
  },
  v: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
  },
  mono: {
    fontFamily: 'monospace',
  },
  cardHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  reasonMain: {
    fontSize: 14,
    color: colors.ink,
    marginTop: 6,
    fontWeight: '500',
  },
  reasonQuote: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 8,
    lineHeight: 18,
  },
  note: {
    backgroundColor: colors.tealTint,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 12,
  },
  infoIcon: {
    fontSize: 14,
    color: colors.tealDark,
    marginRight: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: colors.tealDark,
    lineHeight: 17,
  },
  spacer: {
    height: 24,
  },
  btnPrimary: {
    backgroundColor: colors.teal,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnDangerGhost: {
    borderWidth: 1,
    borderColor: colors.coralTint,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDangerGhostText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#A7402C',
  },
});