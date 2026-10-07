import React, { useCallback, useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';
import {
  ActivityIndicator,
  AppState,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces } from '../theme/tokens';
import { useApiResource } from '../api/g_useApiResource';
import { errorMessage } from '../api/g_apiClient';
import { useHomeFonts } from '../theme/homeFonts';
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
  const homeFonts = useHomeFonts();
  const navigation = useContext(NavigationContext);
  const [greetingTime, setGreetingTime] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let focused = navigation?.isFocused() ?? true;
    let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    const update = () => {
      clearTimeout(timer);
      if (!focused || !foreground) return;
      const now = new Date();
      setGreetingTime(now);
      // Colombo has a fixed UTC+05:30 offset. Schedule only noon, 18:00, and midnight.
      const local = new Date(now.getTime() + 330 * 60000);
      const hour = local.getUTCHours();
      const boundary = new Date(local);
      boundary.setUTCHours(hour < 12 ? 12 : hour < 18 ? 18 : 24, 0, 0, 0);
      timer = setTimeout(update, boundary.getTime() - local.getTime());
    };
    update();
    const focus = navigation?.addListener('focus', () => { focused = true; update(); });
    const blur = navigation?.addListener('blur', () => { focused = false; clearTimeout(timer); });
    const subscription = AppState.addEventListener('change', state => { foreground = state === 'active'; update(); });
    return () => { clearTimeout(timer); focus?.(); blur?.(); subscription.remove(); };
  }, [navigation]);
  const bodyFont = { fontFamily: homeFonts.body };
  const displayFont = { fontFamily: homeFonts.display, fontWeight: 'normal' as const };
  const semiboldFont = { fontFamily: homeFonts.semibold, fontWeight: 'normal' as const };
  const [refreshError, setRefreshError] = useState<string>();
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const result = await fetchDashboard(accessToken, signal);
        if (!signal.aborted) setRefreshError(undefined);
        return result;
      } catch (cause) {
        if (!signal.aborted) setRefreshError(errorMessage(cause));
        throw cause;
      }
    },
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
  const name = staff?.fullName?.trim() || data?.staff.fullName?.trim() || '';
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
            <Text style={[styles.avatarText, semiboldFont]}>
              {name ? initials(name) : '··'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.teal} />}>
        <Text style={[styles.greet, bodyFont]}>{name ? `${greeting(greetingTime)} ${name}` : greeting(greetingTime).replace(/,$/, '')}</Text>
        <Text accessibilityRole="header" style={[styles.title, displayFont]}>
          Reception desk
        </Text>
        {hospital ? <Text style={[styles.sub, bodyFont]}>{hospital}</Text> : null}

        {(error || refreshError) ? (
          <View style={styles.noteWarn}>
            <Text accessibilityLiveRegion="polite" style={[styles.noteWarnText, bodyFont]}>{error ?? refreshError}</Text>
            {data ? <Text style={[styles.noteWarnText, bodyFont]}>Showing last loaded dashboard data.</Text> : null}
            <TouchableOpacity
              style={styles.linkButton}
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={reload}
            >
              <Text style={[styles.link, semiboldFont]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {loading && !data ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.teal} />
            <Text accessibilityLiveRegion="polite" style={[styles.sub, bodyFont]}>Loading dashboard…</Text>
          </View>
        ) : null}

        {data ? (
          <>
            <View style={styles.kpiRow}>
              <TouchableOpacity style={styles.kpi} accessibilityRole="button"
                accessibilityLabel="View today's OPD sessions" disabled={loading}
                accessibilityState={{ disabled: loading }} onPress={onOpenSessions}>
                <Text style={[styles.kpiLabel, semiboldFont]}>Sessions today</Text>
                <Text style={[styles.kpiNumber, displayFont]}>{data.sessionsToday}</Text>
              </TouchableOpacity>
              <View style={styles.kpi}>
                <Text style={[styles.kpiLabel, semiboldFont]}>Priority waiting</Text>
                <Text style={[styles.kpiNumber, styles.kpiAlert, displayFont]}>
                  {data.priorityWaiting}
                </Text>
              </View>
            </View>
            <View style={[styles.kpiRow, styles.kpiRowSecond]}>
              <View style={styles.kpi}>
                <Text style={[styles.kpiLabel, semiboldFont]}>Patients checked in</Text>
                <Text style={[styles.kpiNumber, displayFont]}>{data.patientsCheckedIn}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={[styles.kpiLabel, semiboldFont]}>Now serving</Text>
                <Text style={[styles.kpiNumber, displayFont]}>{data.nowServing ?? '—'}</Text>
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.groupRow}>
          <Text accessibilityRole="header" style={[styles.group, semiboldFont]}>
            {"Today's sessions"}
          </Text>
          <TouchableOpacity
            style={styles.linkButton}
            accessibilityRole="button"
            accessibilityLabel="View today's OPD sessions"
            disabled={loading}
            accessibilityState={{ disabled: loading }}
            onPress={onOpenSessions}
          >
            <Text style={[styles.link, semiboldFont]}>View all</Text>
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
                    <Text style={[styles.rowName, semiboldFont]}>{session.serviceName}</Text>
                    <Text style={[styles.rowSub, bodyFont]}>
                      {formatTime(session.startsAt)} · {session.bookedCount} of{' '}
                      {session.capacity} booked
                    </Text>
                  </View>
                  <View style={[styles.badge, badge.badge]}>
                    <View style={[styles.badgeDot, badge.dot]} />
                    <Text style={[styles.badgeText, badge.text, semiboldFont]}>
                      {session.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.rowSub, bodyFont]}>
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
          <Text style={[waiting ? styles.btnUrgentText : styles.btnOutlineText, semiboldFont]}>
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
    borderRadius: radii.circle,
    width: 48,
    height: 48,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bell: { fontSize: 15 },
  dotAlert: {
    borderRadius: radii.circle,
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
    borderRadius: radii.circle,
    overflow: 'hidden',
    width: 48,
    height: 48,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: colors.tealDark },
  avatarImage: { width: 48, height: 48 },
  content: {
    ...surfaces.content,
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  greet: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '700',
    color: colors.tealDark,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft },
  loader: { marginTop: 32, alignItems: 'center', gap: 8 },
  noteWarn: {
    borderRadius: radii.note,
    backgroundColor: colors.amberTint,
    padding: 13,
    marginTop: 16,
    gap: 8,
  },
  noteWarnText: { fontSize: 14, color: '#8A611A', lineHeight: 20 },
  linkButton: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  link: { fontSize: 14, fontWeight: '600', color: colors.teal },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16, marginBottom: 4 },
  kpiRowSecond: { marginTop: 12 },
  kpi: {
    borderRadius: radii.md,
    flex: 1,
    minWidth: 130,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  kpiLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  kpiNumber: {
    fontFamily: fonts.display,
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
  group: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  list: {
    borderRadius: radii.md,
    overflow: 'hidden',
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
  rowName: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  rowSub: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    marginTop: 2,
  },
  empty: {
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    padding: 16,
  },
  badge: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDot: { borderRadius: radii.circle, width: 6, height: 6, marginRight: 5 },
  badgeText: { fontSize: 13, fontWeight: '600' },
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
    borderRadius: radii.pill,
    backgroundColor: colors.coralStrong,
    minHeight: 52,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnUrgentText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  btnOutline: {
    minHeight: 52,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.sage,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: { fontSize: 15, fontWeight: '600', color: colors.tealDark },
});
