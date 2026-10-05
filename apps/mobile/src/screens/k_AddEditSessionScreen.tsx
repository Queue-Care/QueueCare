import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, errorMessage } from '../api/g_apiClient';
import { ActionButton } from '../components/ActionButton';
import { getHospitalServices, HospitalDetailsError, type HospitalService } from '../features/hospitals/hospitalDetails';
import { fetchStaffSession, fetchStaffSessions, saveStaffSession, type StaffOpdSession } from '../features/sessions/k_staffSessions';
import { emptySessionForm, sessionFormValues, validateSessionForm, type SessionForm } from '../features/sessions/k_sessionForm';
import { colors, radii, surfaces } from '../theme/tokens';
import { useHomeFonts } from '../theme/homeFonts';

type Props = { accessToken?: string; sessionId?: string; onCancel: () => void;
  onSaved: (session: StaffOpdSession) => void; onSessionExpired?: () => void };

export function AddEditSessionScreen({ accessToken, sessionId, onCancel, onSaved, onSessionExpired }: Props) {
  const fonts = useHomeFonts();
  const [form, setForm] = useState<SessionForm>({ ...emptySessionForm });
  const [services, setServices] = useState<HospitalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const lock = useRef(false);
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
      setErrors({}); setMessage(''); setLoading(false);
    })().catch(reason => {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 401) expired.current?.();
      setLoadError(reason instanceof HospitalDetailsError
        ? 'Could not load hospital services. Check your connection and try again.' : errorMessage(reason));
      setLoading(false);
    });
    return () => controller.abort();
  }, [accessToken, sessionId, version]);
  const change = (key: keyof SessionForm, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => { const next = { ...current }; delete next[key]; return next; });
    setMessage('');
  };
  const save = useCallback(async () => {
    if (lock.current || loading || loadError) return;
    const validation = validateSessionForm(form);
    if (!services.some(service => service.id === form.serviceId))
      validation.serviceId = 'Choose an available department/service.';
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
    } finally { lock.current = false; if (alive.current) setSaving(false); }
  }, [accessToken, form, services, sessionId, loading, loadError, onSaved]);
  const bodyFont = { fontFamily: fonts.body };
  const field = (key: Exclude<keyof SessionForm, 'serviceId'>, label: string, placeholder: string) =>
    <View style={styles.field} key={key}>
      <Text style={[styles.label, { fontFamily: fonts.semibold }]}>{label}</Text>
      <TextInput accessibilityLabel={label} accessibilityHint={placeholder} editable={!saving}
        style={[styles.input, bodyFont, errors[key] && styles.invalid]} value={form[key]}
        onChangeText={value => change(key, value)} placeholder={placeholder} placeholderTextColor={colors.inkSoft}
        keyboardType={key === 'capacity' ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} />
      {errors[key] ? <Text accessibilityRole="alert" style={[styles.error, bodyFont]}>{errors[key]}</Text> : null}
    </View>;
  return <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: fonts.display }]}>{sessionId ? 'Edit session' : 'Add session'}</Text>
        <Text style={[styles.sub, bodyFont]}>{sessionId ? 'Update the session details. Existing bookings remain in place.' : 'Bookings open to patients as soon as you save.'}</Text>
        {loading ? <View style={styles.field}><ActivityIndicator color={colors.teal} /><Text style={[styles.sub, bodyFont]}>Loading session details…</Text></View> : null}
        {loadError ? <View style={styles.field}><Text accessibilityRole="alert" style={[styles.error, bodyFont]}>{loadError}</Text>
          <ActionButton label="Try again" onPress={() => { setLoading(true); setLoadError(''); setVersion(value => value + 1); }} /></View> : null}
        {!loading && !loadError ? <>
          <View style={styles.field}><Text style={[styles.label, { fontFamily: fonts.semibold }]}>Department/Service</Text>
            {services.map(service => <Pressable key={service.id} accessibilityRole="radio"
              accessibilityLabel={service.name} accessibilityState={{ checked: form.serviceId === service.id, disabled: saving }}
              disabled={saving} onPress={() => change('serviceId', service.id)}
              style={[styles.input, form.serviceId === service.id && styles.selected]}>
              <Text style={[styles.sub, bodyFont]}>{form.serviceId === service.id ? '✓ ' : ''}{service.name}</Text>
            </Pressable>)}
            {!services.length ? <Text style={[styles.error, bodyFont]}>No active services are available. Ask your hospital administrator to set up a service.</Text> : null}
            {form.serviceId && !services.some(service => service.id === form.serviceId) ? <Text style={[styles.error, bodyFont]}>The saved service is unavailable. Select an active service.</Text> : null}
            {errors.serviceId ? <Text accessibilityRole="alert" style={[styles.error, bodyFont]}>{errors.serviceId}</Text> : null}
          </View>
          {field('sessionDate', 'Date', 'YYYY-MM-DD')}
          <Text style={[styles.sub, bodyFont]}>Times use the 24-hour clock in Sri Lanka time.</Text>
          {field('startTime', 'Start time', '08:30')}
          {field('endTime', 'End time', '12:30')}
          {field('capacity', 'Capacity', 'Number of patients')}
          {field('doctorOrTeam', 'Doctor/Team', 'Doctor or clinic team')}
          <Text style={[styles.note, bodyFont]}>Only authorised staff can create or edit sessions. Changes are recorded against your staff ID.</Text>
          {message ? <Text accessibilityRole="alert" style={[styles.error, bodyFont]}>{message}</Text> : null}
          <ActionButton label={saving ? 'Saving session…' : sessionId ? 'Update session' : 'Create session'} busy={saving}
            disabled={!services.length} onPress={() => void save()} />
        </> : null}
        <ActionButton label="Cancel" variant="outline" disabled={saving} onPress={onCancel} />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mist },
  content: { ...surfaces.content, padding: 22, gap: 18 },
  title: { fontSize: 28, color: colors.tealDark },
  sub: { fontSize: 15, color: colors.inkSoft },
  label: { fontSize: 16, color: colors.ink },
  field: { gap: 8 },
  input: { minHeight: 52, padding: 14, fontSize: 16, color: colors.ink,
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md },
  selected: { backgroundColor: colors.tealTint, borderColor: colors.teal, borderWidth: 2 },
  invalid: { borderColor: colors.coralStrong },
  error: { fontSize: 15, color: colors.coralStrong },
  note: { padding: 14, backgroundColor: colors.amberTint, borderRadius: radii.note, color: colors.ink, fontSize: 15 },
});
