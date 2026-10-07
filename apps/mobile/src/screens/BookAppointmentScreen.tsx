import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { bookingMessages } from '../features/booking/createBooking';
import type { BookingSubmission } from '../features/booking/useBookingSubmission';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { StatusText } from '../components/StatusText';
import { InterfaceIcon } from '../components/InterfaceIcon';
import {
  colomboDate,
  isCalendarDate,
  isSessionBookable,
  sessionTimeLabel,
  SESSION_TIME_ZONE,
} from '../features/booking/availableSessions';
import { useAvailableSessions } from '../features/booking/useAvailableSessions';
import type { PatientSummary } from '../navigation/types';
import {
  colors,
  fonts,
  surfaces,
  typography,
  radii,
  spacing,
} from '../theme/tokens';

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
  const [showAllServices, setShowAllServices] = useState(false);
  const [dateError, setDateError] = useState('');
  // Pending calendar value; iOS confirms it with "Use date", Android applies it on selection.
  const [picker, setPicker] = useState<Date | null>(null);
  const { state, selected, select, reload, now } = useAvailableSessions({
    hospitalId,
    serviceId: showAllServices ? undefined : serviceId,
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
  const chooseDate = (value: string) => {
    if (submission.pending) return;
    if (!isCalendarDate(value) || value < colomboDate()) {
      setDateError('Choose today or a future date.');
      return;
    }
    setDateError('');
    if (value === date) reload();
    else setDate(value);
  };
  const openCalendar = () => {
    if (submission.pending) return;
    setDateError('');
    setPicker(new Date(`${date}T12:00:00+05:30`));
  };
  const acceptCalendar = (value: Date) => {
    setPicker(null);
    if (Number.isFinite(value.getTime())) chooseDate(colomboDate(value));
  };
  const calendar = picker ? (
    <DateTimePicker
      value={picker}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      timeZoneName={SESSION_TIME_ZONE}
      themeVariant="light"
      accentColor={colors.teal}
      minimumDate={new Date(`${colomboDate()}T00:00:00+05:30`)}
      onValueChange={(_event, value) =>
        Platform.OS === 'ios' ? setPicker(value) : acceptCalendar(value)
      }
      onDismiss={() => setPicker(null)}
      onError={() => {
        setPicker(null);
        setDateError('Could not open the calendar. Please try again.');
      }}
    />
  ) : null;
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Appointment date"
            accessibilityValue={{ text: friendlyDate(date) }}
            accessibilityHint="Opens a calendar to choose today or a future date"
            accessibilityState={{
              disabled: submission.pending,
              expanded: !!picker,
            }}
            disabled={submission.pending}
            onPress={openCalendar}
            style={({ pressed }) => [
              styles.dateControl,
              pressed && styles.dateControlPressed,
              submission.pending && styles.dateControlDisabled,
            ]}
          >
            <View style={styles.dateIcon}>
              <InterfaceIcon name="Calendar" color={colors.tealDark} />
            </View>
            <Text style={[styles.heading, styles.grow]}>
              {friendlyDate(date)}
            </Text>
            <Text style={styles.dateChange}>Change</Text>
          </Pressable>
          {!!dateError && (
            <StatusText accessibilityRole="alert" style={styles.error}>
              {dateError}
            </StatusText>
          )}
        </View>
        <Text accessibilityRole="header" style={styles.heading}>
          Sessions for {date}
        </Text>
        <View style={styles.card}>
          <Text style={styles.body}>
            {serviceId && !showAllServices
              ? 'Showing sessions for the OPD service you selected.'
              : 'Showing sessions for all OPD services at this hospital.'}
          </Text>
          {serviceId && (
            <ActionButton
              label={showAllServices ? 'Show selected service' : 'Show all services'}
              variant="secondary"
              disabled={submission.pending}
              onPress={() => setShowAllServices(current => !current)}
            />
          )}
        </View>
        {state.status === 'loading' ? (
          <View style={styles.card} accessibilityState={{ busy: true }}>
            <ActivityIndicator
              color={colors.teal}
              accessible={false}
              importantForAccessibility="no"
            />
            <StatusText style={styles.body} accessibilityState={{ busy: true }}>
              Loading sessions…
            </StatusText>
          </View>
        ) : state.status === 'unavailable' ? (
          <View style={styles.card}>
            <StatusText accessibilityRole="alert" style={styles.heading}>
              Hospital or service unavailable
            </StatusText>
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
            <StatusText accessibilityRole="alert" style={styles.heading}>
              We couldn’t load sessions
            </StatusText>
            <Text style={styles.body}>
              Check your connection and try again.
            </Text>
            <ActionButton
              label="Try again"
              onPress={refresh}
              disabled={submission.pending}
              variant="secondary"
            />
          </View>
        ) : (
          <>
            {sessions.length > 0 && (
              <StatusText style={styles.body}>
                {`${sessions.length} upcoming ${
                  sessions.length === 1 ? 'session' : 'sessions'
                } for ${date}. ${
                  sessions.filter(item => isSessionBookable(item, now)).length
                } available to book.`}
              </StatusText>
            )}
            {sessions.length === 0 ? (
              <View style={styles.card}>
                <StatusText style={styles.heading}>
                  No upcoming sessions for this date
                </StatusText>
                <Text style={styles.body}>
                  {serviceId && !showAllServices
                    ? 'Try Show all services to check other clinics at this hospital, or choose another date.'
                    : 'Try another date or check again later.'}
                </Text>
              </View>
            ) : (
              sessions.map(session => {
                const bookable = isSessionBookable(session, now);
                const checked = selected?.id === session.id;
                const capacity =
                  session.remainingCapacity === 0
                    ? 'Fully booked'
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
                      styles.sessionControl,
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
                      <View
                        style={[styles.radio, checked && styles.radioSelected]}
                        accessible={false}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        {checked ? <View style={styles.radioFill} /> : null}
                      </View>
                    </View>
                    <Text style={[styles.badge, !bookable && styles.fullBadge]}>
                      {capacity}
                    </Text>
                  </Pressable>
                );
              })
            )}
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
          <View style={styles.card}>
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
                variant="secondary"
                onPress={onSessionExpired}
              />
            )}
          </View>
        )}
        {attempt && outcome && (
          <View style={styles.card}>
            <Text style={styles.heading}>Booking request</Text>
            <Text style={styles.body}>{attempt.label}</Text>
            {outcome.status === 'pending' ? (
              <>
                <ActivityIndicator
                  color={colors.teal}
                  accessible={false}
                  importantForAccessibility="no"
                />
                <StatusText style={styles.body}>
                  Confirming your appointment…
                </StatusText>
              </>
            ) : outcome.status === 'success' ? (
              <>
                <StatusText style={styles.heading}>
                  Appointment saved
                </StatusText>
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
                <StatusText accessibilityRole="alert" style={styles.body}>
                  {bookingMessages[outcome.kind]}
                </StatusText>
                {['duplicate', 'uncertain'].includes(outcome.kind) && (
                  <ActionButton
                    label="Check My bookings"
                    variant="secondary"
                    onPress={onBookings}
                  />
                )}
                {outcome.kind === 'uncertain' &&
                  selected?.id === attempt.sessionId && (
                    <ActionButton
                      label="Retry same session"
                      variant="quiet"
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
          busy={submission.pending}
          accessibilityHint={
            submission.pending
              ? 'Please wait while your appointment is saved'
              : !submission.authenticated
              ? 'Sign in with an active patient account first'
              : !patientName
              ? 'Your patient profile must be loaded first'
              : !selected
              ? 'Select an available session above'
              : needsRecovery
              ? 'Use the booking request actions above to check or recover your booking'
              : 'Saves your appointment and opens the booking summary'
          }
          onPress={() => {
            void confirm();
          }}
        />
      </ScrollView>
      {Platform.OS === 'ios' ? (
        <Modal
          visible={!!picker}
          transparent
          animationType="fade"
          onRequestClose={() => setPicker(null)}
        >
          <View style={styles.overlay}>
            <View style={styles.dialog}>
              <Text accessibilityRole="header" style={styles.heading}>
                Choose appointment date
              </Text>
              {calendar}
              <ActionButton
                label="Use date"
                onPress={() => {
                  if (picker) acceptCalendar(picker);
                }}
              />
              <ActionButton
                label="Cancel"
                variant="quiet"
                onPress={() => setPicker(null)}
              />
            </View>
          </View>
        </Modal>
      ) : (
        calendar
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    ...surfaces.content,
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: typography.title,
  heading: typography.heading,
  body: typography.body,
  card: {
    ...surfaces.card,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
  },
  dateControl: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.panel,
  },
  dateControlPressed: {
    backgroundColor: colors.tealTint,
    borderColor: colors.tealDark,
  },
  dateControlDisabled: { backgroundColor: colors.canvas },
  dateIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.icon,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChange: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.tealDark,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(23,48,42,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  sessionControl: { minHeight: 52, borderColor: colors.controlBorder },
  grow: { flex: 1 },
  selected: surfaces.selected,
  full: { backgroundColor: colors.mist },
  radio: {
    borderRadius: radii.circle,
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: colors.controlBorder,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.teal, borderWidth: 2 },
  radioFill: {
    borderRadius: radii.circle,
    width: 11,
    height: 11,
    backgroundColor: colors.teal,
  },
  badge: {
    alignSelf: 'flex-start',
    color: colors.tealDark,
    backgroundColor: colors.tealTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    fontWeight: '600',
  },
  fullBadge: { backgroundColor: colors.amberTint, color: colors.ink },
  error: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  pressed: { borderColor: colors.tealDark, borderWidth: 2 },
});
function friendlyDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00.000Z`));
}
