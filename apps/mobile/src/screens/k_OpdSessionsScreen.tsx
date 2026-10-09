import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { InterfaceIcon } from '../components/InterfaceIcon';
import { SessionToast } from '../components/k_SessionToast';
import { ApiError, errorMessage } from '../api/g_apiClient';
import { useApiResource } from '../api/g_useApiResource';
import { closeStaffSessionBookings, fetchStaffSession, fetchStaffSessions, sessionDayLabel,
  type SessionView, type StaffOpdSession, type StaffSessionPage } from '../features/sessions/k_staffSessions';
import { colors, radii, surfaces } from '../theme/tokens';
import { useHomeFonts } from '../theme/homeFonts';
import { useSessionWaitingCounts } from '../features/sessions/k_useSessionWaitingCounts';
import { endedSessionMessage, sessionEndTimestamp, sessionHasEnded, useSessionEditClock } from '../features/sessions/k_sessionEditing';
import { pickerStrings } from '../features/sessions/k_sessionForm';
import { useT } from '../i18n/g_language';

type Props = { accessToken?: string; hospital?: string; onSessionExpired?: () => void; targetSessionId?: string;
  savedSessionDate?: string; saveMessage?: string; onSaveMessageConsumed?: () => void;
  onAdd: () => void; onEdit: (sessionId: string) => void };

export function OpdSessionsScreen(props: Props) {
  const { targetSessionId, accessToken, onSessionExpired } = props;
  const t = useT();
  const [view, setView] = useState<SessionView>('today');
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(props.savedSessionDate);
  const [resolvedTarget, setResolvedTarget] = useState<string>();
  const locating = !!targetSessionId && /^[a-f\d]{24}$/i.test(targetSessionId) && resolvedTarget !== targetSessionId;
  const [targetPage, setTargetPage] = useState<{ view: SessionView; page: number; date?: string; data: StaffSessionPage }>();
  useEffect(() => {
    const targetId = targetSessionId;
    if (!targetId || !/^[a-f\d]{24}$/i.test(targetId)) return;
    const controller = new AbortController();
    void (async () => {
      const session = await fetchStaffSession(accessToken, targetId, controller.signal);
      if (session._id !== targetId) return;
      const today = pickerStrings(new Date()).date;
      if (session.sessionDate < today) return;
      const nextView = session.sessionDate > today ? 'upcoming' : 'today';
      const nextDate = session.sessionDate < today ? session.sessionDate : undefined;
      for (let nextPage = 1; !controller.signal.aborted; nextPage++) {
        const result = nextDate ? await fetchStaffSessions(accessToken, nextView, nextPage, controller.signal, nextDate)
          : await fetchStaffSessions(accessToken, nextView, nextPage, controller.signal);
        if (controller.signal.aborted) return;
        if (result.data.some(item => item._id === targetId)) {
          setView(nextView); setPage(nextPage); setDate(nextDate);
          setTargetPage({ view: nextView, page: nextPage, date: nextDate, data: result });
          return;
        }
        if (!result.hasMore || result.data.length === 0) return;
      }
    })().catch(reason => {
      if (!controller.signal.aborted && reason instanceof ApiError && reason.status === 401) onSessionExpired?.();
    }).finally(() => { if (!controller.signal.aborted) setResolvedTarget(targetId); });
    return () => controller.abort();
  }, [targetSessionId, accessToken, onSessionExpired]);
  const [successToast, setSuccessToast] = useState(() => props.saveMessage?.replace(/\.$/, ''));
  const { onSaveMessageConsumed } = props;
  const consumed = useRef(false);
  useEffect(() => {
    if (successToast && !consumed.current) { consumed.current = true; onSaveMessageConsumed?.(); }
  }, [successToast, onSaveMessageConsumed]);
  const dismissSuccessToast = useCallback(() => setSuccessToast(undefined), []);
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <SessionToast message={successToast && t(successToast)} onDismiss={dismissSuccessToast} />
    {locating ? <ActivityIndicator accessibilityLabel="Finding selected session" color={colors.teal} /> : <SessionsPage key={`${view}:${page}:${date ?? ''}:${props.targetSessionId ?? ''}`} {...props} date={date}
    targetSessionId={targetPage ? props.targetSessionId : undefined}
    initialData={targetPage?.view === view && targetPage.page === page && targetPage.date === date ? targetPage.data : undefined}
    view={view} page={page} onPage={next => { setTargetPage(undefined); setPage(next); }}
    onView={next => { setTargetPage(undefined); setView(next); setPage(1); setDate(undefined); }} />}
  </SafeAreaView>;
}

function SessionsPage({ accessToken, hospital, onSessionExpired, onAdd, onEdit, view, page, onPage, onView, date, targetSessionId, initialData }:
  Props & { view: SessionView; page: number; date?: string; initialData?: StaffSessionPage; onPage: (page: number) => void; onView: (view: SessionView) => void }) {
  const fonts = useHomeFonts();
  const t = useT();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState<string>();
  const [pickerDate, setPickerDate] = useState<Date | null>(null);
  const [calendarTick, setCalendarTick] = useState(0);
  const today = pickerStrings(new Date()).date;
  // Increment a UTC calendar-day marker, then construct the Colombo midnight instant.
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const minimumDate = new Date(`${tomorrow}T00:00:00+05:30`);
  const activeFilterDate = view === 'upcoming' && filterDate && filterDate > today ? filterDate : undefined;
  useEffect(() => {
    // Re-evaluate stale filters and rows at Colombo midnight without API polling.
    void calendarTick;
    const timer = setTimeout(() => setCalendarTick(tick => tick + 1), Math.max(1, Date.parse(`${tomorrow}T00:00:00+05:30`) - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [tomorrow, calendarTick]);
  const listPending = useRef(false);
  const initial = useRef(initialData);
  const scroll = useRef<ScrollView>(null);
  const revealed = useRef(false);
  const load = useCallback(async (signal: AbortSignal) => {
    listPending.current = true;
    try {
      if (initial.current) { const result = initial.current; initial.current = undefined; return result; }
      const requestedDate = date && (view !== 'upcoming' || date > pickerStrings(new Date()).date) ? date : undefined;
      const result = await (requestedDate ? fetchStaffSessions(accessToken, view, page, signal, requestedDate)
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
    Alert.alert(t('Close bookings?'), t('Stop new bookings for {service} on {day}? Existing bookings will remain valid.', { service: session.serviceName ?? t('this session'), day: sessionDayLabel(session.sessionDate) }), [
      { text: t('Cancel'), style: 'cancel', onPress: release },
      { text: t('Close bookings'), style: 'destructive', onPress: () => {
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
  const query = searchQuery.trim().toLowerCase();
  const visibleSessions = data?.data.filter(session =>
    (view !== 'upcoming' || session.sessionDate > today) &&
    (!query || [session.serviceName, session.doctorOrTeam].some(value => value?.toLowerCase().includes(query))) &&
    (!activeFilterDate || session.sessionDate === activeFilterDate)) ?? [];
  const acceptDate = (value: Date) => {
    if (Number.isFinite(value.getTime())) {
      const selected = pickerStrings(value).date;
      setFilterDate(selected > pickerStrings(new Date()).date ? selected : undefined);
    }
    setPickerDate(null);
  };
  const calendar = pickerDate ? <DateTimePicker value={pickerDate < minimumDate ? minimumDate : pickerDate}
    minimumDate={minimumDate} mode="date" timeZoneName="Asia/Colombo"
    themeVariant="light" display={Platform.OS === 'ios' ? 'inline' : 'default'}
    onValueChange={(_event, value) => Platform.OS === 'ios' ? setPickerDate(value) : acceptDate(value)}
    onDismiss={() => setPickerDate(null)}
    onError={() => { setPickerDate(null); setFeedback('Could not open the picker. Please try again.'); }} /> : null;
  return <SafeAreaView style={styles.safe} edges={['left', 'right']}>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.teal} />}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, styles.grow, { fontFamily: fonts.display }]}>{t('OPD sessions')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Search sessions"
          accessibilityState={{ expanded: searchOpen }} onPress={() => setSearchOpen(true)} style={styles.searchButton}>
          <InterfaceIcon name="Search" color={colors.tealDark} />
        </Pressable>
      </View>
      {hospital ? <Text style={[styles.sub, bodyFont]}>{hospital}</Text> : null}
      {searchOpen ? <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextInput accessibilityLabel="Search sessions by session name, doctor, or clinic team"
            placeholder={t('Search by session or doctor')} autoFocus
            value={searchQuery} onChangeText={setSearchQuery} autoCorrect={false} autoCapitalize="none"
            placeholderTextColor={colors.inkSoft} style={[styles.searchInput, bodyFont]} />
          {view === 'upcoming' ? <Pressable accessibilityRole="button" accessibilityLabel="Filter sessions by date"
            accessibilityState={{ expanded: !!pickerDate }} style={styles.searchIcon}
            onPress={() => { Keyboard.dismiss(); setPickerDate(new Date(`${activeFilterDate ?? tomorrow}T12:00:00+05:30`)); }}>
            <Ionicons name="calendar-outline" size={22} color={colors.tealDark} accessible={false} />
          </Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Close session search" style={styles.searchIcon}
            onPress={() => { Keyboard.dismiss(); setSearchQuery(''); setFilterDate(undefined); setPickerDate(null); setSearchOpen(false); }}>
            <Ionicons name="close" size={22} color={colors.tealDark} accessible={false} />
          </Pressable>
        </View>
        {searchQuery ? <ActionButton label={t('Clear search')} variant="outline" onPress={() => setSearchQuery('')} /> : null}
        {activeFilterDate ? <View style={styles.searchRow}>
          <Text accessibilityLiveRegion="polite" style={[styles.sub, bodyFont]}>{t('Date: {day}', { day: sessionDayLabel(activeFilterDate) })}</Text>
          <ActionButton label={t('Clear date filter')} variant="outline" onPress={() => setFilterDate(undefined)} />
        </View> : null}
      </View> : null}
      {Platform.OS !== 'ios' ? calendar : null}
      {Platform.OS === 'ios' && pickerDate ? <Modal transparent animationType="fade" onRequestClose={() => setPickerDate(null)}>
        <View style={styles.pickerOverlay}><View style={styles.pickerPanel}>
          {calendar}
          <View style={styles.actions}>
            <ActionButton label={t('Cancel date selection')} variant="outline" onPress={() => setPickerDate(null)} />
            <ActionButton label={t('Apply date filter')} onPress={() => acceptDate(pickerDate)} />
          </View>
        </View></View>
      </Modal> : null}
      <View style={styles.segment}>{(['today', 'upcoming'] as const).map(option =>
        <Pressable key={option} accessibilityRole="tab" accessibilityLabel={option === 'today' ? 'Today' : 'Upcoming'}
          accessibilityState={{ selected: !date && view === option, disabled: !!busy }} disabled={!!busy}
          onPress={() => onView(option)} style={[styles.tab, !date && view === option && styles.selected]}>
          <Text style={[styles.tabText, { fontFamily: fonts.semibold }]}>{t(option === 'today' ? 'Today' : 'Upcoming')}</Text>
        </Pressable>)}</View>
      <Text style={[styles.sub, bodyFont]}>{t('Session times are shown in Sri Lanka time.')}</Text>
      {date ? <Text accessibilityLiveRegion="polite" style={[styles.note, bodyFont]}>{t('Sessions for {day}', { day: sessionDayLabel(date) })}</Text> : null}
      {feedback ? <Text accessibilityLiveRegion="polite" style={[styles.note, bodyFont]}>{t(feedback)}</Text> : null}
      {loading && !data ? <View style={styles.state}><ActivityIndicator color={colors.teal} />
        <Text style={[styles.sub, bodyFont]}>{t('Loading sessions…')}</Text></View> : null}
      {error ? <View style={styles.state}><Text accessibilityRole="alert" style={[styles.sub, bodyFont]}>{t(error)}</Text>
        <ActionButton label={t('Try again')} onPress={reload} /></View> : null}
      {!loading && !error && data && (query || activeFilterDate) && visibleSessions.length === 0 ? <View style={styles.state}>
        <Text accessibilityLiveRegion="polite" style={[styles.heading, { fontFamily: fonts.semibold }]}>{t('No sessions match your search.')}</Text>
      </View> : null}
      {!loading && !error && !query && !activeFilterDate && data && visibleSessions.length === 0 ? <View style={styles.state}>
        <Text style={[styles.heading, { fontFamily: fonts.semibold }]}>{t(date ? 'No sessions on this date' : view === 'today' ? 'No sessions today' : 'No upcoming sessions')}</Text>
        <Text style={[styles.sub, bodyFont]}>{t('Add a session or pull down to refresh.')}</Text></View> : null}
      {visibleSessions.map(session => <View key={session._id} style={[styles.card, session._id === targetSessionId && styles.targetCard]}
        onLayout={session._id === targetSessionId ? event => {
          if (!revealed.current && scroll.current) {
            scroll.current.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 14), animated: true });
            revealed.current = true;
          }
        } : undefined}>
        {session._id === targetSessionId ? <Text accessibilityLiveRegion="polite" style={[styles.sub, bodyFont]}>{t('Selected session')}</Text> : null}
        <View style={styles.cardTop}><Text style={[styles.heading, styles.grow, { fontFamily: fonts.semibold }]}>{session.serviceName ?? t('Service unavailable')}</Text>
          <View style={[styles.badge, session.status === 'OPEN' ? styles.openBadge : session.status === 'RUNNING' ? styles.tealBadge : styles.neutralBadge]}>
            <Text style={[styles.status, bodyFont, session.status === 'OPEN' && styles.openStatus]}>{t(session.status === 'CLOSED' ? 'Bookings closed' : session.status?.toLowerCase().replace(/^./, letter => letter.toUpperCase()) ?? 'Status unavailable')}</Text>
          </View></View>
        <Text style={[styles.sub, bodyFont]}>{sessionDayLabel(session.sessionDate)} · {session.startTime ?? '—'} – {session.endTime ?? '—'}</Text>
        <Text style={[styles.sub, bodyFont]}>{session.doctorOrTeam ?? t('Team unavailable')}</Text>
        <View style={styles.metrics}><Text style={[styles.booked, bodyFont]}>{t('{booked} of {capacity} booked', { booked: session.bookedCount, capacity: session.capacity })}</Text>
          {waiting[session._id] ? <View style={styles.waitingBadge} accessible
            accessibilityLabel={`${session.serviceName ?? 'OPD session'}: ${waiting[session._id].count !== undefined
              ? `${waiting[session._id].count} ${waiting[session._id].count === 1 ? 'patient' : 'patients'} waiting${waiting[session._id].state === 'stale' ? ', last updated' : ''}`
              : waiting[session._id].state === 'loading' ? 'Loading waiting count' : 'Waiting count unavailable'}`}>
            <Text style={[styles.booked, bodyFont]}>{waiting[session._id].count !== undefined
              ? t('{count} waiting', { count: waiting[session._id].count })
              : t(waiting[session._id].state === 'loading' ? 'Loading waiting count…' : 'Waiting count unavailable')}</Text>
            {waiting[session._id].state === 'stale' ? <Text style={[styles.sub, bodyFont]}>{t('Last updated')}</Text> : null}
          </View> : null}
          {waiting[session._id] ? <View style={styles.waitingBadge} accessible
            accessibilityLabel={`${session.serviceName ?? 'OPD session'}: ${waiting[session._id].priorityCount !== undefined
              ? `${waiting[session._id].priorityCount} priority patients waiting${waiting[session._id].state === 'stale' ? ', last updated' : ''}`
              : waiting[session._id].state === 'loading' ? 'Loading priority count' : 'Priority count unavailable'}`}>
            <Text style={[styles.booked, bodyFont]}>{waiting[session._id].priorityCount !== undefined
              ? t('{count} priority waiting', { count: waiting[session._id].priorityCount })
              : t(waiting[session._id].state === 'loading' ? 'Loading priority count…' : 'Priority count unavailable')}</Text>
            {waiting[session._id].state === 'stale' ? <Text style={[styles.sub, bodyFont]}>{t('Last updated')}</Text> : null}
          </View> : null}
        </View>
        <View style={styles.actions}>
          {!sessionHasEnded(session, editTime) ? <ActionButton label={t('Edit session')} variant="secondary" disabled={!!busy || loading} busy={busy === session._id}
            accessibilityHint={`Edit ${session.serviceName ?? 'OPD session'} on ${sessionDayLabel(session.sessionDate)}`} onPress={() => void edit(session)} /> : null}
          {session.status === 'OPEN' ? <ActionButton label={t('Close bookings')} variant="outline" disabled={!!busy || loading}
            accessibilityHint={`Stop new bookings for ${session.serviceName ?? 'OPD session'}`} onPress={() => confirmClose(session)} /> : null}
        </View>
      </View>)}
      {data && (page > 1 || data.hasMore) ? <View style={styles.actions}>
        <ActionButton label={t('Previous page')} variant="outline" disabled={page === 1 || !!busy || loading} onPress={() => onPage(page - 1)} />
        <ActionButton label={t('Next page')} variant="outline" disabled={!data.hasMore || !!busy || loading} onPress={() => onPage(page + 1)} />
      </View> : null}
      <ActionButton label={t('Add a session')} disabled={!!busy} onPress={onAdd} />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mist },
  content: { ...surfaces.content, padding: 22, paddingBottom: 30, gap: 14 },
  title: { fontSize: 28, color: colors.tealDark },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderRadius: radii.note },
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  searchField: { width: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.sageLine, borderRadius: radii.note, backgroundColor: colors.panel },
  searchIcon: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  searchInput: { flex: 1, minHeight: 48, paddingHorizontal: 14, color: colors.ink, fontSize: 15 },
  pickerOverlay: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,0.35)' },
  pickerPanel: { padding: 16, borderRadius: radii.note, backgroundColor: colors.panel, gap: 14 },
  sub: { fontSize: 15, color: colors.inkSoft },
  heading: { fontSize: 18, color: colors.ink },
  grow: { flex: 1 },
  segment: { flexDirection: 'row', backgroundColor: colors.tealTint, borderRadius: radii.pill, padding: 4 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: radii.pill },
  selected: { backgroundColor: colors.panel },
  tabText: { fontSize: 16, color: colors.tealDark },
  card: { ...surfaces.card, gap: 10 },
  targetCard: { borderColor: colors.tealDark, borderWidth: 2 },
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  badge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6 },
  tealBadge: { backgroundColor: colors.tealTint },
  openBadge: { backgroundColor: colors.tealTint, borderWidth: 1, borderColor: colors.tealDark },
  openStatus: { color: colors.tealDark, fontWeight: '600' },
  neutralBadge: { backgroundColor: colors.amberTint },
  status: { fontSize: 14, color: colors.ink },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.sageLine },
  waitingBadge: { backgroundColor: colors.tealTint, borderRadius: radii.note, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 1 },
  booked: { fontSize: 15, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  state: { paddingVertical: 24, gap: 14 },
  note: { padding: 14, backgroundColor: colors.tealTint, borderRadius: radii.note, color: colors.ink, fontSize: 15 },
});
