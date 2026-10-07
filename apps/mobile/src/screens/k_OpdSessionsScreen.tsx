import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { SessionToast } from '../components/k_SessionToast';
import { ApiError, errorMessage } from '../api/g_apiClient';
import { useApiResource } from '../api/g_useApiResource';
import { closeStaffSessionBookings, fetchStaffSession, fetchStaffSessions, sessionDayLabel,
  type SessionView, type StaffOpdSession } from '../features/sessions/k_staffSessions';
import { colors, radii, surfaces } from '../theme/tokens';
import { useHomeFonts } from '../theme/homeFonts';
import { useSessionWaitingCounts } from '../features/sessions/k_useSessionWaitingCounts';
import { endedSessionMessage, sessionEndTimestamp, sessionHasEnded, useSessionEditClock } from '../features/sessions/k_sessionEditing';

type Props = { accessToken?: string; hospital?: string; onSessionExpired?: () => void;
  savedSessionDate?: string; saveMessage?: string; onSaveMessageConsumed?: () => void;
  onAdd: () => void; onEdit: (sessionId: string) => void };

export function OpdSessionsScreen(props: Props) {
  const [view, setView] = useState<SessionView>('today');
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(props.savedSessionDate);
  const [successToast, setSuccessToast] = useState(() => props.saveMessage?.replace(/\.$/, ''));
  const { onSaveMessageConsumed } = props;
  const consumed = useRef(false);
  useEffect(() => {
    if (successToast && !consumed.current) { consumed.current = true; onSaveMessageConsumed?.(); }
  }, [successToast, onSaveMessageConsumed]);
  const dismissSuccessToast = useCallback(() => setSuccessToast(undefined), []);
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <SessionToast message={successToast} onDismiss={dismissSuccessToast} />
    <SessionsPage key={`${view}:${page}:${date ?? ''}`} {...props} date={date}
    view={view} page={page} onPage={setPage}
    onView={next => { setView(next); setPage(1); setDate(undefined); }} />
  </SafeAreaView>;
}

function SessionsPage({ accessToken, hospital, onSessionExpired, onAdd, onEdit, view, page, onPage, onView, date }:
  Props & { view: SessionView; page: number; date?: string; onPage: (page: number) => void; onView: (view: SessionView) => void }) {
  const fonts = useHomeFonts();
  const listPending = useRef(false);
  const load = useCallback(async (signal: AbortSignal) => {
    listPending.current = true;
    try {
      const result = await (date ? fetchStaffSessions(accessToken, view, page, signal, date)
        : fetchStaffSessions(accessToken, view, page, signal));
      // Give every successful refresh an identity so metrics refresh too.
      return { ...result };
    } finally { if (!signal.aborted) listPending.current = false; }
  }, [accessToken, view, page, date]);
  const { data, loading, error, reload, setData } = useApiResource(load, { onUnauthorized: onSessionExpired });
  const editTime = useSessionEditClock(data?.data.map(sessionEndTimestamp) ?? []);
  const waiting = useSessionWaitingCounts(data?.data ?? [], accessToken, onSessionExpired, data, listPending);
  const lock = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => () => { alive.current = false; controller.current?.abort(); }, []);
  const release = () => { lock.current = false; if (alive.current) setBusy(null); };
  const failure = (reason: unknown) => {
    if (!alive.current) return;
    if (reason instanceof ApiError && reason.status === 401) onSessionExpired?.();
    setFeedback(errorMessage(reason));
  };
  const edit = async (session: StaffOpdSession) => {
    if (lock.current) return;
    if (sessionHasEnded(session)) { setFeedback(endedSessionMessage); return; }
    lock.current = true; setBusy(session._id); setFeedback('');
    controller.current = new AbortController();
    try {
      const detail = await fetchStaffSession(accessToken, session._id, controller.current.signal);
      if (alive.current) {
        if (sessionHasEnded(detail)) setFeedback(endedSessionMessage);
        else onEdit(detail._id);
      }
    } catch (reason) { failure(reason); }
    finally { release(); }
  };
  const confirmClose = (session: StaffOpdSession) => {
    if (lock.current || session.status !== 'OPEN') return;
    lock.current = true;
    Alert.alert('Close bookings?', `Stop new bookings for ${session.serviceName ?? 'this session'} on ${sessionDayLabel(session.sessionDate)}? Existing bookings will remain valid.`, [
      { text: 'Cancel', style: 'cancel', onPress: release },
      { text: 'Close bookings', style: 'destructive', onPress: () => {
        if (!alive.current) { release(); return; }
        setBusy(session._id); setFeedback('');
        controller.current = new AbortController();
        void closeStaffSessionBookings(accessToken, session._id, controller.current.signal).then(updated => {
          if (!alive.current) return;
          if (data) setData({ ...data, data: data.data.map(item => item._id === updated._id ? updated : item) });
          setFeedback('Bookings closed. Existing bookings remain valid.');
          reload();
        }).catch(failure).finally(release);
      } },
    ], { cancelable: false });
  };
  const bodyFont = { fontFamily: fonts.body };
  return <SafeAreaView style={styles.safe} edges={['left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.teal} />}>
      <Text accessibilityRole="header" style={[styles.title, { fontFamily: fonts.display }]}>OPD sessions</Text>
      {hospital ? <Text style={[styles.sub, bodyFont]}>{hospital}</Text> : null}
      <View style={styles.segment}>{(['today', 'upcoming'] as const).map(option =>
        <Pressable key={option} accessibilityRole="tab" accessibilityLabel={option === 'today' ? 'Today' : 'Upcoming'}
          accessibilityState={{ selected: !date && view === option, disabled: !!busy }} disabled={!!busy}
          onPress={() => onView(option)} style={[styles.tab, !date && view === option && styles.selected]}>
          <Text style={[styles.tabText, { fontFamily: fonts.semibold }]}>{option === 'today' ? 'Today' : 'Upcoming'}</Text>
        </Pressable>)}</View>
      <Text style={[styles.sub, bodyFont]}>Session times are shown in Sri Lanka time.</Text>
      {date ? <Text accessibilityLiveRegion="polite" style={[styles.note, bodyFont]}>Sessions for {sessionDayLabel(date)}</Text> : null}
      {feedback ? <Text accessibilityLiveRegion="polite" style={[styles.note, bodyFont]}>{feedback}</Text> : null}
      {loading && !data ? <View style={styles.state}><ActivityIndicator color={colors.teal} />
        <Text style={[styles.sub, bodyFont]}>Loading sessions…</Text></View> : null}
      {error ? <View style={styles.state}><Text accessibilityRole="alert" style={[styles.sub, bodyFont]}>{error}</Text>
        <ActionButton label="Try again" onPress={reload} /></View> : null}
      {!loading && !error && data?.data.length === 0 ? <View style={styles.state}>
        <Text style={[styles.heading, { fontFamily: fonts.semibold }]}>{date ? 'No sessions on this date' : view === 'today' ? 'No sessions today' : 'No upcoming sessions'}</Text>
        <Text style={[styles.sub, bodyFont]}>Add a session or pull down to refresh.</Text></View> : null}
      {data?.data.map(session => <View key={session._id} style={styles.card}>
        <View style={styles.cardTop}><Text style={[styles.heading, styles.grow, { fontFamily: fonts.semibold }]}>{session.serviceName ?? 'Service unavailable'}</Text>
          <View style={[styles.badge, session.status === 'OPEN' || session.status === 'RUNNING' ? styles.tealBadge : styles.neutralBadge]}>
            <Text style={[styles.status, bodyFont]}>{session.status === 'CLOSED' ? 'Bookings closed' : session.status?.toLowerCase().replace(/^./, letter => letter.toUpperCase()) ?? 'Status unavailable'}</Text>
          </View></View>
        <Text style={[styles.sub, bodyFont]}>{sessionDayLabel(session.sessionDate)} · {session.startTime ?? '—'} – {session.endTime ?? '—'}</Text>
        <Text style={[styles.sub, bodyFont]}>{session.doctorOrTeam ?? 'Team unavailable'}</Text>
        <View style={styles.metrics}><Text style={[styles.booked, bodyFont]}>{session.bookedCount ?? '—'} of {session.capacity ?? '—'} booked</Text>
          {waiting[session._id] ? <View style={styles.waitingBadge} accessible
            accessibilityLabel={`${session.serviceName ?? 'OPD session'}: ${waiting[session._id].count !== undefined
              ? `${waiting[session._id].count} ${waiting[session._id].count === 1 ? 'patient' : 'patients'} waiting${waiting[session._id].state === 'stale' ? ', last updated' : ''}`
              : waiting[session._id].state === 'loading' ? 'Loading waiting count' : 'Waiting count unavailable'}`}>
            <Text style={[styles.booked, bodyFont]}>{waiting[session._id].count !== undefined
              ? `${waiting[session._id].count} waiting`
              : waiting[session._id].state === 'loading' ? 'Loading waiting count…' : 'Waiting count unavailable'}</Text>
            {waiting[session._id].state === 'stale' ? <Text style={[styles.sub, bodyFont]}>Last updated</Text> : null}
          </View> : null}
          {waiting[session._id] ? <View style={styles.waitingBadge} accessible
            accessibilityLabel={`${session.serviceName ?? 'OPD session'}: ${waiting[session._id].priorityCount !== undefined
              ? `${waiting[session._id].priorityCount} priority patients waiting${waiting[session._id].state === 'stale' ? ', last updated' : ''}`
              : waiting[session._id].state === 'loading' ? 'Loading priority count' : 'Priority count unavailable'}`}>
            <Text style={[styles.booked, bodyFont]}>{waiting[session._id].priorityCount !== undefined
              ? `${waiting[session._id].priorityCount} priority waiting`
              : waiting[session._id].state === 'loading' ? 'Loading priority count…' : 'Priority count unavailable'}</Text>
            {waiting[session._id].state === 'stale' ? <Text style={[styles.sub, bodyFont]}>Last updated</Text> : null}
          </View> : null}
        </View>
        <View style={styles.actions}>
          {!sessionHasEnded(session, editTime) ? <ActionButton label="Edit session" variant="secondary" disabled={!!busy || loading} busy={busy === session._id}
            accessibilityHint={`Edit ${session.serviceName ?? 'OPD session'} on ${sessionDayLabel(session.sessionDate)}`} onPress={() => void edit(session)} /> : null}
          {session.status === 'OPEN' ? <ActionButton label="Close bookings" variant="outline" disabled={!!busy || loading}
            accessibilityHint={`Stop new bookings for ${session.serviceName ?? 'OPD session'}`} onPress={() => confirmClose(session)} /> : null}
        </View>
      </View>)}
      {data && (page > 1 || data.hasMore) ? <View style={styles.actions}>
        <ActionButton label="Previous page" variant="outline" disabled={page === 1 || !!busy || loading} onPress={() => onPage(page - 1)} />
        <ActionButton label="Next page" variant="outline" disabled={!data.hasMore || !!busy || loading} onPress={() => onPage(page + 1)} />
      </View> : null}
      <ActionButton label="Add a session" disabled={!!busy} onPress={onAdd} />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mist },
  content: { ...surfaces.content, padding: 22, paddingBottom: 30, gap: 14 },
  title: { fontSize: 28, color: colors.tealDark },
  sub: { fontSize: 15, color: colors.inkSoft },
  heading: { fontSize: 18, color: colors.ink },
  grow: { flex: 1 },
  segment: { flexDirection: 'row', backgroundColor: colors.tealTint, borderRadius: radii.pill, padding: 4 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: radii.pill },
  selected: { backgroundColor: colors.panel },
  tabText: { fontSize: 16, color: colors.tealDark },
  card: { ...surfaces.card, gap: 10 },
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  badge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6 },
  tealBadge: { backgroundColor: colors.tealTint },
  neutralBadge: { backgroundColor: colors.amberTint },
  status: { fontSize: 14, color: colors.ink },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.sageLine },
  waitingBadge: { backgroundColor: colors.tealTint, borderRadius: radii.note, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 1 },
  booked: { fontSize: 15, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  state: { paddingVertical: 24, gap: 14 },
  note: { padding: 14, backgroundColor: colors.tealTint, borderRadius: radii.note, color: colors.ink, fontSize: 15 },
});
