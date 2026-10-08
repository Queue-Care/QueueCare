import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces } from '../theme/tokens';
import { PasswordField } from '../components/g_PasswordField';
import { SessionToast } from '../components/k_SessionToast';
import { signInStaff, StaffAuthError } from '../features/staff/g_staffAuth';
import type { StaffSession } from '../features/staff/g_staffAuth';

export const StaffSignInScreen = ({
  navigation,
  route,
  onAuthenticated,
}: any) => {
  const routeStaffId: string | undefined = route?.params?.staffId;
  const [staffId, setStaffId] = useState(routeStaffId ?? '');
  // Registration returns here with the new Staff ID while this screen is still mounted.
  const [appliedStaffId, setAppliedStaffId] = useState(routeStaffId);
  if (routeStaffId !== appliedStaffId) {
    setAppliedStaffId(routeStaffId);
    if (routeStaffId) setStaffId(routeStaffId);
  }
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  const [authError, setAuthError] = useState('');
  const [connectionToast, setConnectionToast] = useState<string>();
  const dismissConnectionToast = useCallback(() => setConnectionToast(undefined), []);
  const lock = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  const staffIdError = attempted && !staffId.trim() ? 'Enter your Staff ID.' : fieldErrors.staffId;
  const passwordError = attempted && !password ? 'Enter your password.' : fieldErrors.password;
  const valid = !!staffId.trim() && !!password;
  const handleSignIn = async () => {
    if (lock.current) return;
    setAttempted(true);
    if (!valid) return;
    lock.current = true;
    setFieldErrors({});
    setAuthError('');
    setSubmitting(true);
    controller.current = new AbortController();
    try {
      const session: StaffSession = await signInStaff(staffId.trim(), password, controller.current.signal);
      if (!alive.current) return;
      onAuthenticated?.({
        userId: session.userId,
        accessToken: session.accessToken,
        role: session.role,
        staff: {
          fullName: session.fullName,
          staffId: session.staffId,
          hospital: session.hospital,
          preferredLanguage: session.preferredLanguage,
        },
      });
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof StaffAuthError && Object.keys(error.fieldErrors).length) {
        setFieldErrors(error.fieldErrors);
        return;
      }
      if (error instanceof StaffAuthError && ['NETWORK_ERROR', 'TIMEOUT'].includes(error.code))
        setConnectionToast('Connection problem');
      else setAuthError(error instanceof StaffAuthError
        ? error.status === 401 || error.code === 'INVALID_CREDENTIALS' ? 'Invalid Staff ID or password.' : error.message
        : 'Could not sign in. Please try again.');
    } finally {
      lock.current = false;
      if (alive.current) setSubmitting(false);
    }
  };

  const handleRequestAccount = () => {
    navigation?.navigate?.('StaffRegistration');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <SessionToast message={connectionToast} kind="error" onDismiss={dismissConnectionToast} />
      <View style={styles.navHead}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation?.goBack?.()}
        >
          <Text style={styles.backBtnArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap} />
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Brand Icon Mark */}
        <View style={styles.markTint}>
          <Text style={styles.markIcon}>▦</Text>
        </View>

        <Text style={styles.screenTitle}>Staff sign in</Text>
        <Text style={styles.lede}>For reception and OPD coordinators.</Text>

        <View style={styles.spacerTop} />

        {/* Staff ID Field */}
        <View style={styles.field}>
          <Text style={styles.label}>Staff ID</Text>
          <TextInput
            style={[styles.control, styles.mono, staffIdError && { borderColor: colors.coral }]}
            accessibilityLabel="Staff ID"
            accessibilityHint="Required"
            autoCorrect={false}
            value={staffId}
            editable={!submitting}
            onChangeText={value => { setStaffId(value); setAuthError(''); setFieldErrors(current => ({ ...current, staffId: '' })); }}
            autoCapitalize="characters"
          />
          {staffIdError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={{ color: colors.coralStrong, marginTop: 5 }}>{staffIdError}</Text> : null}
        </View>

        {/* Password Field */}
        <PasswordField
          label="Password"
          value={password}
          onChangeText={value => { if (!lock.current) { setPassword(value); setAuthError(''); setFieldErrors(current => ({ ...current, password: '' })); } }}
          error={passwordError}
        />

        {authError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
          style={{ color: colors.coralStrong, marginBottom: 10 }}>{authError}</Text> : null}

        {/* Sign In Button */}
        <TouchableOpacity
          style={[styles.btnPrimary, submitting && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          onPress={handleSignIn}
          accessibilityState={{ disabled: submitting, busy: submitting }}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Reset password"
          onPress={() => navigation?.navigate?.('ResetPassword')}
        >
          <Text style={styles.linkText}>Reset password</Text>
        </TouchableOpacity>

        <View style={styles.spacerMiddle} />

        {/* Warning Note Banner */}
        <View style={styles.noteWarn}>
          <Text style={styles.warnIcon}>⚠</Text>
          <Text style={styles.warnText}>
            Use the Staff ID and password you created to sign in to the
            Reception Desk.
          </Text>
        </View>

        {/* Request Staff Account Button */}
        <TouchableOpacity
          style={styles.btnOutline}
          onPress={handleRequestAccount}
          accessibilityRole="button"
          accessibilityLabel="Don’t have an account? Request a staff account"
          activeOpacity={0.8}
        >
          <Text style={styles.btnOutlineText}>
            Don’t have an account? Request a staff account
          </Text>
        </TouchableOpacity>
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
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  backBtn: {
    borderRadius: radii.circle,
    width: 38,
    height: 38,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnArrow: {
    fontFamily: fonts.body,
    fontSize: 24,
    color: colors.tealDark,
    lineHeight: 28,
  },
  titleWrap: {
    flex: 1,
  },
  container: {
    ...surfaces.content,
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 28,
    flexGrow: 1,
  },
  markTint: {
    borderRadius: radii.mark,
    width: 70,
    height: 70,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    marginTop: 6,
  },
  markIcon: {
    fontFamily: fonts.body,
    fontSize: 28,
    color: colors.tealDark,
  },
  screenTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '700',
    color: colors.tealDark,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  lede: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
    marginBottom: 14,
  },
  spacerTop: {
    height: 10,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
  },
  control: {
    borderRadius: radii.sm,
    fontFamily: fonts.body,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sage,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.ink,
    minHeight: 48,
  },
  controlFocused: {
    borderColor: colors.teal,
  },
  controlDropdown: {
    borderRadius: radii.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sage,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValue: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  chev: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.inkSoft,
  },
  mono: {
    fontFamily: fonts.mono,
  },
  btnPrimary: {
    borderRadius: radii.pill,
    backgroundColor: colors.teal,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  btnPrimaryText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  linkText: {
    textAlign: 'center',
    color: colors.teal,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
  },
  spacerMiddle: {
    flex: 1,
    minHeight: 24,
  },
  noteWarn: {
    borderRadius: radii.note,
    backgroundColor: colors.amberTint,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  warnIcon: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.amber,
    marginRight: 8,
    marginTop: 1,
  },
  warnText: {
    flex: 1,
    fontSize: 12,
    color: '#8A611A',
    lineHeight: 18,
  },
  btnOutline: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.sage,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    // Space at the sides so a two-line label stays inside the rounded ends.
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.tealDark,
    // Each line is centred when the label wraps on a narrow phone.
    textAlign: 'center',
  },
});
