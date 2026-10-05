import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces, shadows } from '../theme/tokens';

export const PriorityRequestsScreen = ({ navigation }: any) => {
  const [tab, setTab] = useState<'pending' | 'decided'>('pending');

  const pendingRequests = [
    {
      id: 'req_1',
      name: 'Kasun Perera',
      service: 'General OPD · 8:30 AM',
      reason: 'Elderly patient',
      bookingCode: 'OPD-2026-00481',
      avatar: 'KP',
    },
    {
      id: 'req_2',
      name: 'Amaya Silva',
      service: 'Medical OPD · 9:00 AM',
      reason: 'Mobility assistance',
      bookingCode: 'OPD-2026-00488',
      avatar: 'AS',
    },
    {
      id: 'req_3',
      name: 'Ruwan Fernando',
      service: 'General OPD · 10:30 AM',
      reason: 'Something else',
      bookingCode: 'OPD-2026-00492',
      avatar: 'RF',
    },
    {
      id: 'req_4',
      name: 'Dinithi Perera',
      service: 'Child OPD · 11:00 AM',
      reason: 'Pregnant patient',
      bookingCode: 'OPD-2026-00501',
      avatar: 'DP',
    },
  ];

  const decidedRequests = [
    {
      id: 'req_5',
      name: 'Ishara Bandara',
      service: 'General OPD · 8:30 AM',
      reason: 'Elderly patient',
      bookingCode: 'OPD-2026-00470',
      avatar: 'IB',
      status: 'Accepted',
    },
  ];

  const activeList = tab === 'pending' ? pendingRequests : decidedRequests;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navHead}>
        <Text style={styles.navTitle}>Priority requests</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.searchIcon}>🔍</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.segmentWrap}>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'pending' && styles.segmentActive]}
            onPress={() => setTab('pending')}
          >
            <Text
              style={[
                styles.segmentText,
                tab === 'pending' && styles.segmentTextActive,
              ]}
            >
              Pending · 4
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'decided' && styles.segmentActive]}
            onPress={() => setTab('decided')}
          >
            <Text
              style={[
                styles.segmentText,
                tab === 'decided' && styles.segmentTextActive,
              ]}
            >
              Decided
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.list}>
          {activeList.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.listRow}
              activeOpacity={0.7}
              onPress={() =>
                navigation?.navigate('PriorityRequestDetails', { item })
              }
            >
              <View
                style={[
                  styles.avatar,
                  tab === 'pending' ? styles.avatarCoral : styles.avatarTeal,
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    tab === 'pending'
                      ? styles.avatarTextCoral
                      : styles.avatarTextTeal,
                  ]}
                >
                  {item.avatar}
                </Text>
              </View>

              <View style={styles.grow}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.service}</Text>
                <Text style={styles.reason}>{item.reason}</Text>
              </View>

              {tab === 'pending' ? (
                <View style={styles.badgePriority}>
                  <View style={styles.badgeDotCoral} />
                  <Text style={styles.badgeTextCoral}>Pending</Text>
                </View>
              ) : (
                <View style={styles.badgeDone}>
                  <View style={styles.badgeDotDone} />
                  <Text style={styles.badgeTextDone}>Accepted</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  navTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.tealDark,
  },
  iconBtn: {
    borderRadius: radii.circle,
    width: 38,
    height: 38,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    fontFamily: fonts.body,
    fontSize: 14,
  },
  segmentWrap: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 4,
  },
  segment: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    backgroundColor: colors.tealTint,
    padding: 4,
  },
  segmentBtn: {
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.panel,
    ...shadows.segment,
  },
  segmentText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  segmentTextActive: {
    color: colors.tealDark,
  },
  scrollContent: {
    ...surfaces.content,
    paddingTop: 8,
    paddingBottom: 24,
  },
  list: {
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.sageLine,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  avatar: {
    borderRadius: radii.circle,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarCoral: {
    backgroundColor: colors.coralTint,
  },
  avatarTeal: {
    backgroundColor: colors.tealTint,
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 13,
  },
  avatarTextCoral: {
    color: '#A7402C',
  },
  avatarTextTeal: {
    color: colors.tealDark,
  },
  grow: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },
  reason: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 3,
  },
  badgePriority: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.coralTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDotCoral: {
    borderRadius: radii.circle,
    width: 6,
    height: 6,
    backgroundColor: colors.coral,
    marginRight: 5,
  },
  badgeTextCoral: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: '#A7402C',
  },
  badgeDone: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.doneBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDotDone: {
    borderRadius: radii.circle,
    width: 6,
    height: 6,
    backgroundColor: '#3C8558',
    marginRight: 5,
  },
  badgeTextDone: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: colors.doneText,
  },
});