import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, errorMessage } from '../api/g_apiClient';
import { ActionButton } from '../components/ActionButton';
import { SessionToast } from '../components/k_SessionToast';
import { getHospitalServices, HospitalDetailsError, type HospitalService } from '../features/hospitals/hospitalDetails';
import { fetchStaffSession, fetchStaffSessions, saveStaffSession, type StaffOpdSession } from '../features/sessions/k_staffSessions';
import { emptySessionForm, friendlySessionDate, friendlySessionTime, pickerStrings, sessionFormValues, validateSessionForm, type SessionForm } from '../features/sessions/k_sessionForm';
import { colors, radii, surfaces } from '../theme/tokens';
import { useHomeFonts } from '../theme/homeFonts';
import { endedSessionMessage, sessionEndTimestamp, useSessionEditClock } from '../features/sessions/k_sessionEditing';

type Props = { accessToken?: string; sessionId?: string; onCancel: () => void;
  onSaved: (session: StaffOpdSession) => void; onSessionExpired?: () => void };

export function AddEditSessionScreen({ accessToken, sessionId, onCancel, onSaved, onSessionExpired }: Props) {
  const fonts = useHomeFonts();
  const navigation = useContext(NavigationContext);
  useLayoutEffect(() => {
    navigation?.setOptions({ headerTitleStyle: {
      fontFamily: fonts.display, fontSize: 26, fontWeight: '600',
    } });
  }, [navigation, fonts.display]);
  const [form, setForm] = useState<SessionForm>({ ...emptySessionForm });
  const [services, setServices] = useState<HospitalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);
  const [bookedCount, setBookedCount] = useState<number | null>(null);
  const [originalEnd, setOriginalEnd] = useState<number | null>(null);
  const editTime = useSessionEditClock(sessionId ? [originalEnd] : []);
  const ended = !!sessionId && originalEnd !== null && editTime > originalEnd;
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [servicePicker, setServicePicker] = useState(false);
  const [picker, setPicker] = useState<{ field: 'sessionDate' | 'startTime' | 'endTime'; value: Date } | null>(null);
  const lock = useRef(false);
  const [connectionToast, setConnectionToast] = useState<string>();
  const dismissConnectionToast = useCallback(() => setConnectionToast(undefined), []);
  const alive = useRef(true);
  const saveController = useRef<AbortController | null>(null);
  const expired = useRef(onSessionExpired);
  useEffect(() => { expired.current = onSessionExpired; });
  useEffect(() => { alive.current = true; return () => { alive.current = false; saveController.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const scope = await fetchStaffSessions(accessToken, 'today', 1, controller.signal);
      const catalog = await getHospitalServices(scope.hospitalId, controller.signal);
      const session = sessionId ? await fetchStaffSession(accessToken, sessionId, controller.signal) : undefined;
      if (session && session.hospitalId !== scope.hospitalId)
        throw new ApiError('Your hospital assignment changed. Return to sessions and try again.');
      if (controller.signal.aborted) return;
      setServices(catalog);
      setForm(session ? sessionFormValues(session) : { ...emptySessionForm });
      setBookedCount(session?.bookedCount ?? null); setTouched({});
      setAttempted(false);
      setOriginalEnd(session ? sessionEndTimestamp(session) : null);
      setErrors({}); setMessage(''); setLoading(false);
    })().catch(reason => {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 401) expired.current?.();
      setLoadError(reason instanceof HospitalDetailsError
        ? 'Could not load hospital services. Check your connection and try again.' : errorMessage(reason));
      setLoading(false);
      if ((reason instanceof ApiError && reason.status === 0 && reason.code === 'NETWORK_ERROR') ||
          (reason instanceof HospitalDetailsError && reason.kind === 'network'))
        setConnectionToast('Connection problem');
    });
    return () => controller.abort();
  }, [accessToken, sessionId, version]);
  const change = (key: keyof SessionForm, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setTouched(current => ({ ...current, [key]: true }));
    setErrors(current => {
      const next = { ...current }; delete next[key];
      if (key === 'startTime' || key === 'endTime') { delete next.startTime; delete next.endTime; delete next.sessionDate; }
      if (key === 'sessionDate') { delete next.startTime; delete next.endTime; }
      return next;
    });
    setMessage('');
  };
  const save = useCallback(async () => {
    if (lock.current || loading || loadError) return;
    if (sessionId && originalEnd !== null && Date.now() > originalEnd) { setMessage(endedSessionMessage); return; }
    setAttempted(true);
    const validation = validateSessionForm(form, { mode: sessionId ? 'edit' : 'create', bookedCount,
      serviceIds: services.map(service => service.id) });
    setErrors(validation); setMessage('');
    if (Object.keys(validation).length) { setMessage('Check the highlighted session details.'); return; }
    lock.current = true; setSaving(true);
    saveController.current = new AbortController();
    try {
      const saved = await saveStaffSession(accessToken,
        { ...form, capacity: Number(form.capacity), doctorOrTeam: form.doctorOrTeam.trim() }, sessionId, saveController.current.signal);
      if (alive.current) onSaved(saved);
    } catch (reason) {
      if (!alive.current) return;
      if (reason instanceof ApiError) {
        if (reason.status === 401) expired.current?.();
        setErrors(reason.fieldErrors);
      }
      setMessage(errorMessage(reason));
      if (reason instanceof ApiError && reason.status === 0 && reason.code === 'NETWORK_ERROR')
        setConnectionToast('Connection problem');
    } finally { lock.current = false; if (alive.current) setSaving(false); }
  }, [accessToken, form, services, sessionId, bookedCount, originalEnd, loading, loadError, onSaved]);
  const validation = validateSessionForm(form, { mode: sessionId ? 'edit' : 'create', bookedCount,
    serviceIds: services.map(service => service.id) });
  const visibleErrors = { ...Object.fromEntries(Object.entries(validation).filter(([key]) => attempted || touched[key]
    || (key === 'endTime' && touched.startTime && !!form.endTime)
    || (key === 'startTime' && touched.sessionDate && !!form.startTime))), ...errors };
  const bodyFont = { fontFamily: fonts.body };
  const openPicker = (field: 'sessionDate' | 'startTime' | 'endTime') => {
    if (saving) return;
    const today = pickerStrings(new Date()).date;
    const storedDay = friendlySessionDate(form.sessionDate) !== 'Select date' ? form.sessionDate : today;
    const day = field === 'sessionDate' && !sessionId && storedDay < today ? today : storedDay;
    const time = field === 'sessionDate' ? '12:00' : form[field] || (field === 'startTime' ? '08:30' : '12:30');
    const value = new Date(`${day}T${time}:00+05:30`);
    setPicker({ field, value: Number.isFinite(value.getTime()) ? value : new Date() });
  };
  const acceptPicker = (value: Date) => {
    if (!picker || !Number.isFinite(value.getTime())) return;
    const selected = pickerStrings(value);
    if (picker.field === 'sessionDate' && !sessionId && selected.date < pickerStrings(new Date()).date) {
      setPicker(null); return;
    }
    change(picker.field, picker.field === 'sessionDate' ? selected.date : selected.time);
    setPicker(null);
  };
  const pickerControl = (key: 'sessionDate' | 'startTime' | 'endTime', label: string, accessibilityLabel: string) => {
    const display = key === 'sessionDate' ? friendlySessionDate(form[key]) : friendlySessionTime(form[key]);
    return <View style={[styles.field, key !== 'sessionDate' && styles.timeField]}>
      <Text style={[styles.label, { fontFamily: fonts.semibold }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
        accessibilityHint="Required"
        accessibilityValue={{ text: display }} accessibilityState={{ disabled: saving, expanded: picker?.field === key }}
        disabled={saving} onPress={() => openPicker(key)} style={[styles.input, styles.control, visibleErrors[key] && styles.invalid]}>
        <Text style={[styles.value, styles.controlValue, bodyFont]}>{display}</Text><Text accessible={false}>{'\u2304'}</Text>
      </Pressable>
      {visibleErrors[key] ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.error, bodyFont]}>{visibleErrors[key]}</Text> : null}
    </View>;
  };
  const nativePicker = picker ? <DateTimePicker value={picker.value} mode={picker.field === 'sessionDate' ? 'date' : 'time'}
    timeZoneName="Asia/Colombo" themeVariant="light" display={Platform.OS === 'ios' ? picker.field === 'sessionDate' ? 'inline' : 'spinner' : 'default'}
    minimumDate={picker.field === 'sessionDate' && !sessionId ? new Date(`${pickerStrings(new Date()).date}T00:00:00+05:30`) : undefined}
    onValueChange={(_event, value) => Platform.OS === 'ios' ? setPicker({ ...picker, value }) : acceptPicker(value)}
    onDismiss={() => setPicker(null)} onError={() => { setPicker(null); setMessage('Could not open the picker. Please try again.'); }} /> : null;
  const field = (key: Exclude<keyof SessionForm, 'serviceId'>, label: string, placeholder: string) =>
    <View style={styles.field} key={key}>
      <Text style={[styles.label, { fontFamily: fonts.semibold }]}>{label}</Text>
      <TextInput accessibilityLabel={label} accessibilityHint={`${placeholder}. Required.`} editable={!saving}
        style={[styles.input, bodyFont, visibleErrors[key] && styles.invalid]} value={form[key]}
        onChangeText={value => change(key, value)} placeholder={placeholder} placeholderTextColor={colors.inkSoft}
        keyboardType={key === 'capacity' ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} />
      {visibleErrors[key] ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
        style={[styles.error, bodyFont]}>{visibleErrors[key]}</Text> : null}
    </View>;
  return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
    <SessionToast message={connectionToast} kind="error" onDismiss={dismissConnectionToast} />
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sub, bodyFont]}>{sessionId ? 'Update the session details. Existing bookings remain in place.' : 'Bookings open to patients as soon as you save.'}</Text>
        {loading ? <View style={styles.field}><ActivityIndicator color={colors.teal} /><Text style={[styles.sub, bodyFont]}>Loading session details…</Text></View> : null}
        {loadError ? <View style={styles.field}><Text accessibilityRole="alert" style={[styles.error, bodyFont]}>{loadError}</Text>
          <ActionButton label="Try again" onPress={() => { setLoading(true); setLoadError(''); setVersion(value => value + 1); }} /></View> : null}
        {!loading && !loadError ? <>
          <View style={styles.field}><Text style={[styles.label, { fontFamily: fonts.semibold }]}>OPD service</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Select OPD service" accessibilityHint="Required" accessibilityState={{ disabled: saving || !services.length, expanded: servicePicker }}
              disabled={saving || !services.length} onPress={() => setServicePicker(true)} style={[styles.input, styles.control, visibleErrors.serviceId && styles.invalid]}>
              <Text style={[styles.value, styles.controlValue, bodyFont]}>{services.find(service => service.id === form.serviceId)?.name ?? 'Select service'}</Text><Text accessible={false}>{'\u2304'}</Text>
            </Pressable>
            {!services.length ? <Text style={[styles.error, bodyFont]}>No active services are available. Ask your hospital administrator to set up a service.</Text> : null}
            {form.serviceId && !services.some(service => service.id === form.serviceId) ? <Text style={[styles.error, bodyFont]}>The saved service is unavailable. Select an active service.</Text> : null}
            {visibleErrors.serviceId ? <Text accessibilityRole="alert" style={[styles.error, bodyFont]}>{visibleErrors.serviceId}</Text> : null}
          </View>
          {pickerControl('sessionDate', 'Date', 'Select session date')}
          <View style={styles.timeRow}>
            {pickerControl('startTime', 'Starts', 'Select session start time')}
            {pickerControl('endTime', 'Ends', 'Select session end time')}
          </View>
          {field('capacity', 'Patient capacity', 'Number of patients')}
          <Text style={[styles.sub, bodyFont]}>Priority requests are admitted within this capacity.</Text>
          {field('doctorOrTeam', 'Doctor or clinic team', 'Doctor or clinic team')}
          <View style={styles.note}><Text accessible={false} style={styles.value}>{'\u24d8'}</Text>
            <Text style={[styles.noteText, bodyFont]}>Only authorised staff can create or edit sessions. Changes are recorded against your staff ID.</Text></View>
          {ended || message ? <Text accessibilityRole="alert" style={[styles.error, bodyFont]}>{ended ? endedSessionMessage : message}</Text> : null}
          <ActionButton label={saving ? 'Saving session…' : sessionId ? 'Save changes' : 'Save session'} busy={saving}
            disabled={saving || ended} onPress={() => void save()} />
        </> : null}
        <ActionButton label="Cancel" variant="outline" disabled={saving} onPress={onCancel} />
      </ScrollView>
    </KeyboardAvoidingView>
    <Modal visible={servicePicker} transparent animationType="fade" onRequestClose={() => setServicePicker(false)}>
      <View style={styles.overlay}><View style={styles.dialog}>
        <Text accessibilityRole="header" style={[styles.label, bodyFont]}>OPD service</Text>
        <ScrollView>{services.map(service => <Pressable key={service.id} accessibilityRole="radio" accessibilityLabel={service.name}
          accessibilityState={{ checked: form.serviceId === service.id }} onPress={() => { change('serviceId', service.id); setServicePicker(false); }}
          style={[styles.input, form.serviceId === service.id && styles.selected]}><Text style={[styles.value, bodyFont]}>{service.name}</Text></Pressable>)}</ScrollView>
        <ActionButton label="Cancel service selection" variant="outline" onPress={() => setServicePicker(false)} />
      </View></View>
    </Modal>
    {Platform.OS === 'ios' ? <Modal visible={!!picker} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
      <View style={styles.overlay}><View style={styles.dialog}>
        {nativePicker}
        <ActionButton label={picker?.field === 'sessionDate' ? 'Use date' : 'Use time'} onPress={() => { if (picker) acceptPicker(picker.value); }} />
        <ActionButton label="Cancel picker" variant="outline" onPress={() => setPicker(null)} />
      </View></View>
    </Modal> : nativePicker}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mist },
  content: { ...surfaces.content, padding: 22, gap: 18 },
  control: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  value: { fontSize: 16, color: colors.ink },
  controlValue: { flexShrink: 1 },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeField: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 22 },
  dialog: { backgroundColor: colors.panel, borderRadius: radii.md, padding: 18, gap: 16, maxHeight: '85%' },
  noteText: { flex: 1, color: colors.ink, fontSize: 15 },
  sub: { fontSize: 15, color: colors.inkSoft },
  label: { fontSize: 16, color: colors.ink },
  field: { gap: 8 },
  input: { minHeight: 52, padding: 14, fontSize: 16, color: colors.ink,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md },
  selected: { backgroundColor: colors.tealTint, borderColor: colors.teal, borderWidth: 2 },
  invalid: { borderColor: colors.coralStrong },
  error: { fontSize: 15, color: colors.coralStrong },
  note: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: colors.amberTint, borderRadius: radii.note, color: colors.ink, fontSize: 15 },
});
