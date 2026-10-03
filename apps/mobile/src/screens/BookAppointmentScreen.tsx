import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import {
  colomboDate,
  isCalendarDate,
  isSessionBookable,
  sessionTimeLabel,
  shiftDate,
} from '../features/booking/availableSessions';
import { useAvailableSessions } from '../features/booking/useAvailableSessions';
import type { PatientSummary } from '../navigation/types';
import { colors, fonts, radii, spacing } from '../theme/tokens';

export function BookAppointmentScreen({
  hospitalId,
  serviceId,
  patient,
  onChooseHospital,
}: {
  hospitalId: string;
  serviceId?: string;
  patient?: PatientSummary;
  onChooseHospital: () => void;
}) {
  const [date, setDate] = useState(colomboDate);
  const [draftDate, setDraftDate] = useState(date);
  const [dateError, setDateError] = useState('');
  const { state, selected, select, reload, now } = useAvailableSessions({
    hospitalId,
    serviceId,
    date,
  });
  const today = colomboDate(new Date(now));
  const chooseDate = (value: string) => {
    if (!isCalendarDate(value) || value < colomboDate()) {
      setDateError('Enter today or a future date in YYYY-MM-DD format.');
      return;
    }
    setDateError('');
    setDraftDate(value);
    if (value === date) reload();
    else setDate(value);
  };
  const patientName =
    typeof patient?.fullName === 'string' ? patient.fullName.trim() : '';
  const nic = typeof patient?.nic === 'string' ? patient.nic.trim() : '';
  const sessions =
    state.status === 'ready'
      ? state.sessions.filter(item => Date.parse(item.startsAt) > now)
      : [];
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'loading'}
            onRefresh={reload}
            tintColor={colors.teal}
          />
        }
      >
        {state.status === 'ready' && (
          <View>
            <Text style={styles.heading}>{state.hospital.name}</Text>
            <Text style={styles.body}>{state.hospital.city}</Text>
          </View>
        )}
        <Text accessibilityRole="header" style={styles.title}>
          Choose a session
        </Text>
        <View style={styles.card}>
          <Text style={styles.heading}>Appointment date</Text>
          <Text style={styles.body}>
            All dates and times are in Sri Lanka time.
          </Text>
          <TextInput
            accessibilityLabel="Appointment date, YYYY-MM-DD"
            style={styles.input}
            value={draftDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            onChangeText={value => {
              setDraftDate(value);
              setDateError('');
            }}
            onSubmitEditing={() => chooseDate(draftDate)}
            returnKeyType="search"
          />
          {!!dateError && (
            <Text accessibilityRole="alert" style={styles.error}>
              {dateError}
            </Text>
          )}
          <ActionButton
            label="Show sessions"
            variant="outline"
            onPress={() => chooseDate(draftDate)}
          />
          <View style={styles.row}>
            <View style={styles.grow}>
              <ActionButton
                label="Previous day"
                variant="outline"
                disabled={date <= today}
                onPress={() => {
                  if (date > colomboDate()) chooseDate(shiftDate(date, -1));
                }}
              />
            </View>
            <View style={styles.grow}>
              <ActionButton
                label="Next day"
                variant="outline"
                disabled={date === '9999-12-31'}
                onPress={() => {
                  if (date !== '9999-12-31') chooseDate(shiftDate(date, 1));
                }}
              />
            </View>
          </View>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.heading}>
          Sessions for {date}
        </Text>
        {state.status === 'loading' ? (
          <View style={styles.card} accessibilityState={{ busy: true }}>
            <ActivityIndicator color={colors.teal} />
            <Text style={styles.body}>Loading sessions…</Text>
          </View>
        ) : state.status === 'unavailable' ? (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.heading}>
              Hospital or service unavailable
            </Text>
            <Text style={styles.body}>
              Please choose an available hospital and OPD service.
            </Text>
            <ActionButton
              label="Choose another hospital"
              onPress={onChooseHospital}
            />
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.heading}>
              We couldn’t load sessions
            </Text>
            <Text style={styles.body}>
              Check your connection and try again.
            </Text>
            <ActionButton
              label="Try again"
              onPress={reload}
              variant="outline"
            />
          </View>
        ) : (
          <>
            {sessions.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.heading}>
                  No upcoming sessions for this date
                </Text>
                <Text style={styles.body}>
                  Try another date or check again later.
                </Text>
              </View>
            ) : (
              sessions.map(session => {
                const bookable = isSessionBookable(session, now);
                const checked = selected?.id === session.id;
                const capacity =
                  session.remainingCapacity === 0
                    ? 'Full'
                    : `${session.remainingCapacity} ${
                        session.remainingCapacity === 1 ? 'slot' : 'slots'
                      } left`;
                return (
                  <Pressable
                    key={session.id}
                    accessibilityRole="radio"
                    disabled={!bookable}
                    accessibilityLabel={`${session.serviceName}, ${
                      session.sessionDate
                    }, ${sessionTimeLabel(session)}, ${
                      session.doctorOrTeam
                    }, ${capacity}`}
                    accessibilityState={{ checked, disabled: !bookable }}
                    onPress={() => select(session)}
                    style={({ pressed }) => [
                      styles.card,
                      checked && styles.selected,
                      !bookable && styles.full,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.row}>
                      <View style={styles.grow}>
                        <Text style={styles.heading}>
                          {session.serviceName}
                        </Text>
                        <Text style={styles.body}>
                          {sessionTimeLabel(session)}
                        </Text>
                        <Text style={styles.body}>{session.doctorOrTeam}</Text>
                      </View>
                      <Text style={styles.radio} importantForAccessibility="no">
                        {checked ? '●' : '○'}
                      </Text>
                    </View>
                    <Text style={[styles.badge, !bookable && styles.fullBadge]}>
                      {capacity}
                    </Text>
                  </Pressable>
                );
              })
            )}
            <ActionButton
              label="Refresh availability"
              variant="outline"
              onPress={reload}
            />
          </>
        )}
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>
            Patient
          </Text>
          {patientName ? (
            <>
              <Text style={styles.heading}>{patientName}</Text>
              {!!nic && (
                <Text style={styles.body}>
                  NIC ····{nic.length > 4 ? nic.slice(-4) : '····'}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.body}>
              Patient details are unavailable. Your profile must be loaded
              before confirming an appointment.
            </Text>
          )}
        </View>
        {selected && (
          <View style={styles.card} accessibilityLiveRegion="polite">
            <Text style={styles.heading}>Selected session</Text>
            <Text style={styles.body}>
              {selected.serviceName} · {date}
            </Text>
            <Text style={styles.body}>{sessionTimeLabel(selected)}</Text>
          </View>
        )}
        <Text style={styles.body}>
          Online appointment confirmation isn’t available yet. Selecting a
          session does not reserve a place.
        </Text>
        <ActionButton label="Confirm appointment" disabled onPress={() => {}} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 36,
    color: colors.ink,
  },
  heading: {
    fontFamily: fonts.body,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.inkSoft,
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.sm,
    backgroundColor: colors.panel,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: radii.sm,
    padding: spacing.md,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.panel,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  grow: { flex: 1 },
  selected: { borderColor: colors.teal, backgroundColor: colors.tealTint },
  full: { backgroundColor: colors.mist },
  radio: { color: colors.teal, fontSize: 28 },
  badge: {
    alignSelf: 'flex-start',
    color: colors.tealDark,
    backgroundColor: colors.tealTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    fontWeight: '600',
  },
  fullBadge: { backgroundColor: colors.amberTint, color: colors.ink },
  error: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  pressed: { opacity: 0.8 },
});
