import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces } from '../theme/tokens';
import { PasswordField } from '../components/g_PasswordField';
import {
  registerStaff,
  StaffAuthError,
  type StaffRole,
} from '../features/staff/g_staffAuth';
import {
  searchHospitals,
  type Hospital,
} from '../features/hospitals/hospitalSearch';

type Field =
  | 'fullName'
  | 'staffId'
  | 'hospital'
  | 'mobile'
  | 'email'
  | 'password'
  | 'confirmPassword';
const roles: { value: StaffRole; label: string }[] = [
  { value: 'RECEPTION', label: 'Reception' },
  { value: 'NURSE', label: 'Nurse' },
];

// Mirrors the API rules so most mistakes are caught before a request is sent.
function validate(form: Record<Field, string>) {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.fullName.trim()) errors.fullName = 'Enter your full name.';
  if (!/^[A-Za-z0-9-]{3,40}$/.test(form.staffId.trim()))
    errors.staffId = 'Use 3 to 40 letters, numbers, or hyphens.';
  if (!form.hospital.trim()) errors.hospital = 'Choose your hospital.';
  if (!/^\+?[0-9 ()-]{7,24}$/.test(form.mobile.trim()))
    errors.mobile = 'Enter a valid mobile number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    errors.email = 'Enter a valid work email.';
  if (form.password.length < 8) errors.password = 'Use at least 8 characters.';
  // Typing the password twice catches a mistake the user cannot see.
  if (!form.confirmPassword)
    errors.confirmPassword = 'Enter your password again.';
  else if (form.confirmPassword !== form.password)
    errors.confirmPassword = 'The passwords do not match.';
  return errors;
}

export const StaffRegistrationScreen = ({ navigation }: any) => {
  const [form, setForm] = useState<Record<Field, string>>({
    fullName: '',
    staffId: '',
    hospital: '',
    mobile: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [hospitalId, setHospitalId] = useState<string>();
  const [role, setRole] = useState<StaffRole>('RECEPTION');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [picker, setPicker] = useState<'hospital' | 'role' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Hospitals come from the database; typing a name is the fallback when they cannot load.
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    searchHospitals({ search: '', city: '' }, 1, controller.signal)
      .then(page => setHospitals(page.hospitals))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const change = (key: Field, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({
      ...current,
      [key]: undefined,
      // A changed password makes an earlier "do not match" message out of date.
      ...(key === 'password' ? { confirmPassword: undefined } : {}),
    }));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const invalid = validate(form);
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    setSubmitting(true);
    try {
      const account = await registerStaff({
        fullName: form.fullName.trim(),
        staffId: form.staffId.trim(),
        hospital: form.hospital.trim(),
        ...(hospitalId ? { hospitalId } : {}),
        role,
        mobile: form.mobile.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      Alert.alert(
        'Account created',
        'Your staff account is ready. Sign in with your Staff ID and password.',
        [
          {
            text: 'Go to sign in',
            onPress: () =>
              navigation?.navigate?.('StaffSignIn', {
                staffId: account.staffId,
              }),
          },
        ],
      );
    } catch (error) {
      // Show API validation messages beside the fields they belong to.
      const fieldErrors =
        error instanceof StaffAuthError
          ? Object.fromEntries(
              Object.entries(error.fieldErrors)
                .map(([key, text]) => [
                  key === 'hospitalId' ? 'hospital' : key,
                  text,
                ])
                .filter(([key]) => key in form),
            )
          : {};
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      else
        Alert.alert(
          'Could not create account',
          error instanceof StaffAuthError ? error.message : 'Please try again.',
        );
    } finally {
      setSubmitting(false);
    }
  };

  const input = (
    key: Field,
    label: string,
    props: React.ComponentProps<typeof TextInput> = {},
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#9CB0AA"
        value={form[key]}
        onChangeText={text => change(key, text)}
        {...props}
        style={[
          styles.control,
          props.style,
          errors[key] && styles.controlError,
        ]}
      />
      {errors[key] ? <Text style={styles.errorText}>{errors[key]}</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navHead}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to staff sign in"
          onPress={() => navigation?.goBack()}
        >
          <Text style={styles.backBtnArrow}>‹</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.navTitle}>
          Request access
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lede}>
          Enter your hospital details and create a password to set up staff
          access.
        </Text>

        {input('fullName', 'Full name')}
        {input('staffId', 'Staff ID', {
          style: styles.monoText,
          autoCapitalize: 'characters',
          autoCorrect: false,
        })}

        {hospitals.length ? (
          <View style={styles.field}>
            <Text style={styles.label}>Hospital</Text>
            <TouchableOpacity
              style={[
                styles.selectControl,
                errors.hospital && styles.controlError,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Hospital, ${
                form.hospital || 'not selected'
              }`}
              onPress={() => setPicker('hospital')}
            >
              <Text
                style={form.hospital ? styles.selectValue : styles.placeholder}
              >
                {form.hospital || 'Choose your hospital'}
              </Text>
              <Text style={styles.chev}>▼</Text>
            </TouchableOpacity>
            {errors.hospital ? (
              <Text style={styles.errorText}>{errors.hospital}</Text>
            ) : null}
          </View>
        ) : (
          input('hospital', 'Hospital', { placeholder: 'Hospital name' })
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Role</Text>
          <TouchableOpacity
            style={styles.selectControl}
            accessibilityRole="button"
            accessibilityLabel={`Role, ${
              roles.find(item => item.value === role)?.label
            }`}
            onPress={() => setPicker('role')}
          >
            <Text style={styles.selectValue}>
              {roles.find(item => item.value === role)?.label}
            </Text>
            <Text style={styles.chev}>▼</Text>
          </TouchableOpacity>
        </View>

        {input('mobile', 'Mobile number', { keyboardType: 'phone-pad' })}
        {input('email', 'Work email', {
          keyboardType: 'email-address',
          autoCapitalize: 'none',
          autoCorrect: false,
        })}
        <PasswordField
          label="Create password"
          value={form.password}
          onChangeText={text => change('password', text)}
          placeholder="At least 8 characters"
          error={errors.password}
        />
        <PasswordField
          label="Confirm password"
          value={form.confirmPassword}
          onChangeText={text => change('confirmPassword', text)}
          placeholder="Enter the same password again"
          error={errors.confirmPassword}
        />

        <View style={styles.spacer} />

        <TouchableOpacity
          style={[styles.primaryBtn, submitting && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Create staff account"
          disabled={submitting}
          onPress={handleSubmit}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>
            {submitting ? 'Creating account…' : 'Create staff account'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={picker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              {picker === 'role' ? 'Choose your role' : 'Choose your hospital'}
            </Text>
            <ScrollView style={styles.options}>
              {picker === 'role'
                ? roles.map(item => (
                    <TouchableOpacity
                      key={item.value}
                      style={styles.option}
                      accessibilityRole="radio"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: role === item.value }}
                      onPress={() => {
                        setRole(item.value);
                        setPicker(null);
                      }}
                    >
                      <View style={styles.optionText}>
                        <Text style={styles.optionName}>{item.label}</Text>
                      </View>
                      {role === item.value ? (
                        <Text style={styles.selectedMark}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  ))
                : hospitals.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.option}
                      accessibilityRole="radio"
                      accessibilityLabel={`${item.name}, ${item.city}`}
                      accessibilityState={{ selected: hospitalId === item.id }}
                      onPress={() => {
                        change('hospital', item.name);
                        setHospitalId(item.id);
                        setPicker(null);
                      }}
                    >
                      <View style={styles.optionText}>
                        <Text style={styles.optionName}>{item.name}</Text>
                        <Text style={styles.optionSub}>{item.city}</Text>
                      </View>
                      {hospitalId === item.id ? (
                        <Text style={styles.selectedMark}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.outlineBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => setPicker(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
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
    marginRight: 14,
  },
  backBtnArrow: {
    fontFamily: fonts.body,
    fontSize: 24,
    color: colors.tealDark,
    lineHeight: 28,
  },
  navTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
    color: colors.tealDark,
  },
  container: {
    ...surfaces.content,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 24,
  },
  lede: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
    marginBottom: 16,
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
  controlError: {
    borderColor: colors.coral,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: '#A7402C',
    marginTop: 5,
  },
  monoText: {
    fontFamily: fonts.mono,
  },
  selectControl: {
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
  selectValue: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
  },
  placeholder: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: '#9CB0AA',
  },
  chev: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.inkSoft,
  },
  spacer: {
    height: 20,
  },
  primaryBtn: {
    borderRadius: radii.pill,
    backgroundColor: colors.teal,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.6,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23, 48, 42, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '70%',
    backgroundColor: colors.mist,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 28,
  },
  sheetTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    fontWeight: '700',
    color: colors.tealDark,
    marginBottom: 16,
  },
  options: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  optionText: {
    flex: 1,
  },
  optionName: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
  },
  optionSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  selectedMark: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.teal,
  },
  outlineBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.sage,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.tealDark,
  },
});
