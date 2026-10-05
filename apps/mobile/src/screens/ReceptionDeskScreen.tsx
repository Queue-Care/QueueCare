import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useApiResource } from '../api/g_useApiResource';
import {
  fetchDashboard,
  greeting,
  type SessionLabel,
} from '../features/staff/g_staffDashboard';
import { formatTime, initials } from '../features/priority/g_priorityRequests';
import type { StaffSummary } from '../navigation/types';

type Props = {
  accessToken?: string;
  staff?: StaffSummary;
  onSessionExpired?: () => void;
  onPendingCount?: (count: number) => void;
  onOpenSessions: () => void;
  onOpenPriority: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
};

// Running sessions use the teal badge; everything else uses the amber waiting badge.
const badgeStyles = (label: SessionLabel) =>
  label === 'Running'
    ? {
        badge: styles.badgeCalled,
        dot: styles.dotCalled,
        text: styles.textCalled,
      }
    : label === 'Ended' || label === 'Cancelled'
    ? { badge: styles.badgeDone, dot: styles.dotDone, text: styles.textDone }
    : {
        badge: styles.badgeWaiting,
        dot: styles.dotWaiting,
        text: styles.textWaiting,
      };

export function ReceptionDeskScreen({
  accessToken,
  staff,
  onSessionExpired,
  onPendingCount,
  onOpenSessions,
  onOpenPriority,
  onOpenNotifications,
  onOpenProfile,
}: Props) {
  const load = useCallback(
    (signal: AbortSignal) => fetchDashboard(accessToken, signal),
    [accessToken],
  );
  // README section 17: reception screens refresh every 5–10 seconds while visible.
  const { data, loading, error, reload } = useApiResource(load, {
    pollMs: 10000,
    onUnauthorized: onSessionExpired,
  });
  const pending = data?.priorityWaiting;
  useEffect(() => {
    if (pending !== undefined) onPendingCount?.(pending);
  }, [pending, onPendingCount]);

  const waiting = pending ?? 0;
  const name = data?.staff.fullName ?? staff?.fullName ?? '';
  const hospital = data?.staff.hospital ?? staff?.hospital ?? '';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.navHead}>
        <View style={styles.grow} />
        <TouchableOpacity
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={
            data?.unreadNotifications
              ? `Notifications, ${data.unreadNotifications} unread`
              : 'Notifications'
          }
          onPress={onOpenNotifications}
        >
          <Text style={styles.bell}>🔔</Text>
          {data?.unreadNotifications ? <View style={styles.dotAlert} /> : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.avatar}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={onOpenProfile}
        >
          {data?.staff.profileImageUrl ? (
            <Image
              source={{ uri: data.staff.profileImageUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarText}>
              {name ? initials(name) : '··'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greet}>{greeting()}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Reception desk
        </Text>
        {hospital ? <Text style={styles.sub}>{hospital}</Text> : null}

        {error && !data ? (
          <View style={styles.noteWarn}>
            <Text style={styles.noteWarnText}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={reload}
            >
              <Text style={styles.link}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.teal} />
        ) : null}

        {data ? (
          <>
            <View style={styles.kpiRow}>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Sessions today</Text>
                <Text style={styles.kpiNumber}>{data.sessionsToday}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Priority waiting</Text>
                <Text style={[styles.kpiNumber, styles.kpiAlert]}>
                  {data.priorityWaiting}
                </Text>
              </View>
            </View>
            <View style={[styles.kpiRow, styles.kpiRowSecond]}>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Patients checked in</Text>
                <Text style={styles.kpiNumber}>{data.patientsCheckedIn}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Now serving</Text>
                <Text style={styles.kpiNumber}>{data.nowServing ?? '—'}</Text>
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.groupRow}>
          <Text accessibilityRole="header" style={styles.group}>
            {"Today's sessions"}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="View sessions"
            onPress={onOpenSessions}
          >
            <Text style={styles.link}>View all</Text>
          </TouchableOpacity>
        </View>
        {!data ? null : data.sessions.length ? (
          <View style={styles.list}>
            {data.sessions.map((session, index) => {
              const badge = badgeStyles(session.label);
              return (
                <View
                  key={session._id}
                  style={[
                    styles.listRow,
                    index === data.sessions.length - 1 && styles.lastRow,
                  ]}
                >
                  <View style={styles.grow}>
                    <Text style={styles.rowName}>{session.serviceName}</Text>
                    <Text style={styles.rowSub}>
                      {formatTime(session.startsAt)} · {session.bookedCount} of{' '}
                      {session.capacity} booked
                    </Text>
                  </View>
                  <View style={[styles.badge, badge.badge]}>
                    <View style={[styles.badgeDot, badge.dot]} />
                    <Text style={[styles.badgeText, badge.text]}>
                      {session.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.rowSub}>
              No OPD sessions are scheduled for today.
            </Text>
          </View>
        )}

        <View style={styles.spacer} />
        <TouchableOpacity
          style={waiting ? styles.btnUrgent : styles.btnOutline}
          accessibilityRole="button"
          accessibilityLabel="Review priority requests"
          activeOpacity={0.8}
          onPress={onOpenPriority}
        >
          <Text style={waiting ? styles.btnUrgentText : styles.btnOutlineText}>
            {waiting
              ? `Review ${waiting} priority request${waiting === 1 ? '' : 's'}`
              : 'View priority requests'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mist },
  navHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
    gap: 10,
  },
  grow: { flex: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bell: { fontSize: 15 },
  dotAlert: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    backgroundColor: colors.coral,
    borderWidth: 1.5,
    borderColor: colors.panel,
  },
  avatar: {
    width: 38,
    height: 38,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: colors.tealDark },
  avatarImage: { width: 38, height: 38 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 24 },
  greet: { fontSize: 14, color: colors.inkSoft },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.tealDark,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  sub: { fontSize: 13, color: colors.inkSoft },
  loader: { marginTop: 32 },
  noteWarn: {
    backgroundColor: colors.amberTint,
    padding: 13,
    marginTop: 16,
    gap: 8,
  },
  noteWarnText: { fontSize: 13, color: '#8A611A', lineHeight: 18 },
  link: { fontSize: 13, fontWeight: '600', color: colors.teal },
  kpiRow: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 4 },
  kpiRowSecond: { marginTop: 12 },
  kpi: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  kpiLabel: { fontSize: 12, fontWeight: '600', color: colors.inkSoft },
  kpiNumber: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.tealDark,
    marginTop: 8,
  },
  kpiAlert: { color: colors.coral },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  group: { fontSize: 15, fontWeight: '700', color: colors.ink },
  list: {
    backgroundColor: colors.panel,
    borderWidth: 1,
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
  lastRow: { borderBottomWidth: 0 },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  empty: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    padding: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDot: { width: 6, height: 6, marginRight: 5 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeCalled: { backgroundColor: colors.tealTint },
  dotCalled: { backgroundColor: colors.teal },
  textCalled: { color: colors.tealDark },
  badgeWaiting: { backgroundColor: colors.amberTint },
  dotWaiting: { backgroundColor: colors.amber },
  textWaiting: { color: '#8A611A' },
  badgeDone: { backgroundColor: colors.doneBg },
  dotDone: { backgroundColor: '#3C8558' },
  textDone: { color: colors.doneText },
  spacer: { flex: 1, minHeight: 20 },
  btnUrgent: {
    backgroundColor: colors.coral,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnUrgentText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.sage,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: { fontSize: 15, fontWeight: '600', color: colors.tealDark },
});
