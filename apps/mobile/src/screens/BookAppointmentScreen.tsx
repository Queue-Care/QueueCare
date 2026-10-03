import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { bookingMessages } from '../features/booking/createBooking';
import type { BookingSubmission } from '../features/booking/useBookingSubmission';
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
  submission,
  onConfirmed,
  onBookings,
  onSessionExpired,
}: {
  hospitalId: string;
  serviceId?: string;
  patient?: PatientSummary;
  submission: BookingSubmission;
  onConfirmed: (bookingId: string) => void;
  onBookings: () => void;
  onSessionExpired?: () => void;
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
  const focused = useIsFocused();
  const [confirmedCandidate, setConfirmedCandidate] = useState<{
    id: string;
    epoch: number;
  }>();
  const focus = useRef({ active: false, epoch: 0 });
  useFocusEffect(
    useCallback(() => {
      focus.current.active = true;
      focus.current.epoch++;
      return () => {
        focus.current.active = false;
        focus.current.epoch++;
      };
    }, []),
  );
  useEffect(() => {
    if (
      confirmedCandidate &&
      focused &&
      focus.current.active &&
      focus.current.epoch === confirmedCandidate.epoch &&
      !['background', 'inactive'].includes(AppState.currentState)
    )
      onConfirmed(confirmedCandidate.id);
  }, [confirmedCandidate, focused, onConfirmed]);
  const attempt =
    selected && submission.outcomes[selected.id]
      ? {
          sessionId: selected.id,
          label: `${selected.serviceName} · ${
            selected.sessionDate
          } · ${sessionTimeLabel(selected)}`,
        }
      : submission.lastAttempt;
  const outcome = attempt ? submission.outcomes[attempt.sessionId] : undefined;
  const handled = useRef(outcome);
  useEffect(() => {
    if (handled.current === outcome) return;
    handled.current = outcome;
    if (
      outcome?.status === 'error' &&
      ['full', 'unavailable', 'validation'].includes(outcome.kind)
    )
      reload();
  }, [outcome, reload]);
  const refresh = () => {
    if (!submission.pending) reload();
  };
  const today = colomboDate(new Date(now));
  const chooseDate = (value: string) => {
    if (submission.pending) return;
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
  const selectedOutcome = selected
    ? submission.outcomes[selected.id]
    : undefined;
  const needsRecovery =
    selectedOutcome?.status === 'success' ||
    selectedOutcome?.status === 'pending' ||
    (selectedOutcome?.status === 'error' &&
      ['uncertain', 'duplicate'].includes(selectedOutcome.kind));
  const canConfirm =
    !!selected &&
    !!patientName &&
    submission.authenticated &&
    !submission.pending &&
    !needsRecovery;
  const confirm = async (retryUncertain = false) => {
    if (
      !selected ||
      !patientName ||
      !submission.authenticated ||
      submission.pending ||
      !isSessionBookable(selected)
    )
      return;
    if (
      needsRecovery &&
      !(
        retryUncertain &&
        selectedOutcome?.status === 'error' &&
        selectedOutcome.kind === 'uncertain'
      )
    )
      return;
    const epoch = focus.current.epoch;
    const booking = await submission.submit(
      selected.id,
      `${selected.serviceName} · ${selected.sessionDate} · ${sessionTimeLabel(
        selected,
      )}`,
    );
    if (booking) setConfirmedCandidate({ id: booking.id, epoch });
  };
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'loading'}
            onRefresh={refresh}
            enabled={!submission.pending}
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
            editable={!submission.pending}
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
            disabled={submission.pending}
            variant="outline"
            onPress={() => chooseDate(draftDate)}
          />
          <View style={styles.row}>
            <View style={styles.grow}>
              <ActionButton
                label="Previous day"
                variant="outline"
                disabled={submission.pending || date <= today}
                onPress={() => {
                  if (date > colomboDate()) chooseDate(shiftDate(date, -1));
                }}
              />
            </View>
            <View style={styles.grow}>
              <ActionButton
                label="Next day"
                variant="outline"
                disabled={submission.pending || date === '9999-12-31'}
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
              onPress={refresh}
              disabled={submission.pending}
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
                    disabled={!bookable || submission.pending}
                    accessibilityLabel={`${session.serviceName}, ${
                      session.sessionDate
                    }, ${sessionTimeLabel(session)}, ${
                      session.doctorOrTeam
                    }, ${capacity}`}
                    accessibilityState={{
                      checked,
                      disabled: !bookable || submission.pending,
                    }}
                    onPress={() => {
                      if (!submission.pending) select(session);
                    }}
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
              onPress={refresh}
              disabled={submission.pending}
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
        {!submission.authenticated && !submission.pending && (
          <View style={styles.card}>
            <Text style={styles.body}>
              Sign in with an active patient account to confirm an appointment.
            </Text>
            {onSessionExpired && (
              <ActionButton
                label="Sign in again"
                variant="outline"
                onPress={onSessionExpired}
              />
            )}
          </View>
        )}
        {attempt && outcome && (
          <View style={styles.card} accessibilityLiveRegion="polite">
            <Text style={styles.heading}>Booking request</Text>
            <Text style={styles.body}>{attempt.label}</Text>
            {outcome.status === 'pending' ? (
              <>
                <ActivityIndicator color={colors.teal} />
                <Text style={styles.body}>Confirming your appointment…</Text>
              </>
            ) : outcome.status === 'success' ? (
              <>
                <Text style={styles.heading}>Appointment saved</Text>
                <Text selectable style={styles.body}>
                  {outcome.booking.bookingCode}
                </Text>
                <ActionButton
                  label="View confirmation"
                  onPress={() => onConfirmed(outcome.booking.id)}
                />
              </>
            ) : (
              <>
                <Text accessibilityRole="alert" style={styles.body}>
                  {bookingMessages[outcome.kind]}
                </Text>
                {['duplicate', 'uncertain'].includes(outcome.kind) && (
                  <ActionButton
                    label="Check My bookings"
                    variant="outline"
                    onPress={onBookings}
                  />
                )}
                {outcome.kind === 'uncertain' &&
                  selected?.id === attempt.sessionId && (
                    <ActionButton
                      label="Retry same session"
                      variant="outline"
                      disabled={
                        !patientName ||
                        !submission.authenticated ||
                        submission.pending
                      }
                      onPress={() => {
                        void confirm(true);
                      }}
                    />
                  )}
              </>
            )}
          </View>
        )}
        <Text style={styles.body}>
          Selecting a session does not reserve a place. Your booking is
          confirmed only after it is saved.
        </Text>
        <ActionButton
          label={
            submission.pending
              ? 'Confirming appointment…'
              : 'Confirm appointment'
          }
          disabled={!canConfirm}
          onPress={() => {
            void confirm();
          }}
        />
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
