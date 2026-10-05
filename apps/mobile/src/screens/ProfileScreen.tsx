import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, radii, surfaces } from '../theme/tokens';
import { ApiError, errorMessage } from '../api/g_apiClient';
import { useApiResource } from '../api/g_useApiResource';
import {
  deleteProfileImage,
  fetchProfile,
  languageLabels,
  prepareProfileImage,
  updatePreferences,
  updateProfile,
  uploadProfileImage,
  type Language,
  type Profile,
} from '../features/profile/g_profile';
import { initials } from '../features/priority/g_priorityRequests';

type Props = {
  accessToken?: string;
  onSignOut?: () => void;
  onSessionExpired?: () => void;
};
type Sheet = 'personal' | 'language' | null;
const languages = Object.keys(languageLabels) as Language[];

export const ProfileScreen = ({
  accessToken,
  onSignOut,
  onSessionExpired,
}: Props) => {
  const load = useCallback(
    (signal: AbortSignal) => fetchProfile(accessToken, signal),
    [accessToken],
  );
  const {
    data: profile,
    loading,
    error,
    reload,
    setData,
  } = useApiResource(load, { onUnauthorized: onSessionExpired });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', email: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const failed = (failure: unknown, title: string) => {
    if (failure instanceof ApiError && failure.status === 401)
      onSessionExpired?.();
    Alert.alert(title, errorMessage(failure));
  };

  const openPersonal = () => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName,
      phone: profile.phone ?? '',
      email: profile.email ?? '',
    });
    setFieldErrors({});
    setSheet('personal');
  };

  const savePersonal = async () => {
    if (!profile || saving) return;
    // Only fields the user actually changed are sent.
    const changes: { fullName?: string; phone?: string; email?: string } = {};
    if (form.fullName.trim() !== profile.fullName)
      changes.fullName = form.fullName.trim();
    if (form.phone.trim() !== (profile.phone ?? ''))
      changes.phone = form.phone.trim();
    if (form.email.trim().toLowerCase() !== (profile.email ?? ''))
      changes.email = form.email.trim();
    if (!Object.keys(changes).length) {
      setSheet(null);
      return;
    }
    setSaving(true);
    try {
      setData(await updateProfile(accessToken, changes));
      setSheet(null);
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        Object.keys(failure.fieldErrors).length
      )
        setFieldErrors(failure.fieldErrors);
      else failed(failure, 'Could not save your details');
    } finally {
      setSaving(false);
    }
  };

  const savePreferences = async (changes: {
    preferredLanguage?: Language;
    notificationsEnabled?: boolean;
  }) => {
    if (!profile || saving) return;
    const previous = profile;
    setData({ ...profile, ...changes });
    setSheet(null);
    setSaving(true);
    try {
      setData(await updatePreferences(accessToken, changes));
    } catch (failure) {
      setData(previous);
      failed(failure, 'Could not save your settings');
    } finally {
      setSaving(false);
    }
  };

  const choosePhoto = async () => {
    if (photoBusy) return;
    let image: ImagePicker.ImagePickerAsset | undefined;
    try {
      // No in-picker crop step: on some Android phones its save button cannot be
      // pressed. The photo is resized here and cropped square by the server.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled) return;
      image = result.assets[0];
    } catch {
      Alert.alert(
        'Could not open your photos',
        'Allow QueueCare to access your photos, then try again.',
      );
      return;
    }
    if (!image) return;
    setPhotoBusy(true);
    try {
      setData(
        await uploadProfileImage(accessToken, await prepareProfileImage(image)),
      );
    } catch (failure) {
      failed(failure, 'Could not save your photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      setData(await deleteProfileImage(accessToken));
    } catch (failure) {
      failed(failure, 'Could not remove your photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  // With a photo already set, the user chooses between replacing and removing it.
  const editPhoto = () => {
    if (!profile || photoBusy) return;
    if (!profile.profileImageUrl) {
      void choosePhoto();
      return;
    }
    Alert.alert('Profile photo', undefined, [
      { text: 'Choose a new photo', onPress: () => void choosePhoto() },
      {
        text: 'Remove photo',
        style: 'destructive',
        onPress: () => void removePhoto(),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => onSignOut?.() },
    ]);

  const rows: {
    label: string;
    value?: string;
    onPress?: () => void;
  }[] = profile
    ? [
        { label: 'Personal information', onPress: openPersonal },
        {
          label: 'Notification settings',
          value: profile.notificationsEnabled ? 'On' : 'Off',
          onPress: () =>
            void savePreferences({
              notificationsEnabled: !profile.notificationsEnabled,
            }),
        },
        {
          label: 'Language',
          value: languageLabels[profile.preferredLanguage],
          onPress: () => setSheet('language'),
        },
        // Staff see their workplace where patients have saved hospitals.
        ...(profile.staffId
          ? [{ label: 'Hospital', value: profile.hospital ?? 'Not set' }]
          : []),
        {
          label: 'Help and support',
          onPress: () =>
            Alert.alert(
              'Help and support',
              'For help with your account or a booking, speak to the reception desk at your hospital.',
            ),
        },
      ]
    : [];

  const field = (
    key: 'fullName' | 'phone' | 'email',
    label: string,
    props: React.ComponentProps<typeof TextInput> = {},
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.control, fieldErrors[key] ? styles.controlError : null]}
        accessibilityLabel={label}
        value={form[key]}
        onChangeText={text => setForm(current => ({ ...current, [key]: text }))}
        {...props}
      />
      {fieldErrors[key] ? (
        <Text style={styles.errorText}>{fieldErrors[key]}</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.navHead}>
        <Text accessibilityRole="header" style={styles.navTitle}>
          Profile
        </Text>
        <TouchableOpacity
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Edit personal information"
          disabled={!profile}
          onPress={openPersonal}
        >
          <Text style={styles.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {loading && !profile ? (
          <ActivityIndicator style={styles.state} color={colors.teal} />
        ) : null}
        {error && !profile ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={reload}
            >
              <Text style={styles.stateLink}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {profile ? (
          <>
            <View style={styles.cardHeader}>
              <TouchableOpacity
                style={styles.avatarLg}
                accessibilityRole="button"
                accessibilityLabel={
                  profile.profileImageUrl
                    ? 'Change profile photo'
                    : 'Add profile photo'
                }
                disabled={photoBusy}
                onPress={editPhoto}
                activeOpacity={0.8}
              >
                {profile.profileImageUrl ? (
                  <Image
                    source={{ uri: profile.profileImageUrl }}
                    style={styles.avatarImage}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Text style={styles.avatarLgText}>
                    {initials(profile.fullName)}
                  </Text>
                )}
                {photoBusy ? (
                  <View style={styles.avatarBusy}>
                    <ActivityIndicator color={colors.panel} />
                  </View>
                ) : (
                  <View style={styles.avatarBadge}>
                    <Text style={styles.avatarBadgeText}>✎</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.nameText}>{profile.fullName}</Text>
              <Text style={styles.subText}>{summary(profile)}</Text>
              <TouchableOpacity
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                onPress={openPersonal}
                activeOpacity={0.8}
              >
                <Text style={styles.editBtnText}>Edit profile</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.list}>
              {rows.map((item, index) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.listRow,
                    index === rows.length - 1 && styles.lastListRow,
                  ]}
                  activeOpacity={0.7}
                  accessibilityRole={item.onPress ? 'button' : 'text'}
                  accessibilityLabel={
                    item.value ? `${item.label}, ${item.value}` : item.label
                  }
                  disabled={!item.onPress}
                  onPress={item.onPress}
                >
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {item.value ? (
                    <Text style={styles.rightValueText}>{item.value}</Text>
                  ) : null}
                  {item.onPress ? <Text style={styles.chev}>›</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.spacer} />

        <TouchableOpacity
          style={styles.outlineBtn}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={confirmSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.outlineBtnText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={sheet !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSheet(null)}
      >
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            {sheet === 'personal' ? (
              <>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  Edit profile
                </Text>
                {field('fullName', 'Full name')}
                {field('phone', 'Mobile number', { keyboardType: 'phone-pad' })}
                {field('email', 'Email', {
                  keyboardType: 'email-address',
                  autoCapitalize: 'none',
                })}
                <TouchableOpacity
                  style={[styles.primaryBtn, saving && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Save changes"
                  disabled={saving}
                  onPress={savePersonal}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryBtnText}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            {sheet === 'language' ? (
              <>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  Language
                </Text>
                <View style={styles.list}>
                  {languages.map((language, index) => {
                    const selected = profile?.preferredLanguage === language;
                    return (
                      <TouchableOpacity
                        key={language}
                        style={[
                          styles.listRow,
                          index === languages.length - 1 && styles.lastListRow,
                        ]}
                        accessibilityRole="radio"
                        accessibilityLabel={languageLabels[language]}
                        accessibilityState={{ selected }}
                        onPress={() =>
                          void savePreferences({ preferredLanguage: language })
                        }
                      >
                        <Text style={styles.rowLabel}>
                          {languageLabels[language]}
                        </Text>
                        {selected ? (
                          <Text style={styles.selectedMark}>✓</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
            <TouchableOpacity
              style={[styles.outlineBtn, styles.sheetCancel]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => setSheet(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

function summary(profile: Profile) {
  return (
    [
      profile.staffId ?? (profile.maskedNic && `NIC ${profile.maskedNic}`),
      profile.phone,
    ]
      .filter(Boolean)
      .join(' · ') ||
    (profile.email ?? '')
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.mist,
  },
  navHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  navTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.tealDark,
  },
  iconBtn: {
    borderRadius: radii.circle,
    width: 38,
    height: 38,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearIcon: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.tealDark,
  },
  container: {
    ...surfaces.content,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  state: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
  },
  stateLink: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.teal,
  },
  cardHeader: {
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLg: {
    borderRadius: radii.circle,
    width: 76,
    height: 76,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarImage: {
    borderRadius: radii.circle,
    width: 76,
    height: 76,
  },
  avatarBusy: {
    borderRadius: radii.circle,
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 48, 42, 0.45)',
  },
  avatarBadge: {
    borderRadius: radii.circle,
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
    borderWidth: 2,
    borderColor: colors.panel,
  },
  avatarBadgeText: {
    fontSize: 12,
    color: colors.panel,
  },
  editBtn: {
    borderRadius: radii.pill,
    marginTop: 14,
    minHeight: 40,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.sage,
  },
  editBtnText: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.tealDark,
  },
  avatarLgText: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700',
    color: colors.tealDark,
  },
  nameText: {
    fontFamily: fonts.body,
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  subText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
  },
  list: {
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  lastListRow: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontFamily: fonts.body,
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
  },
  rightValueText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    marginRight: 8,
  },
  chev: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.sage,
  },
  selectedMark: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.teal,
  },
  spacer: {
    flex: 1,
    minHeight: 40,
  },
  outlineBtn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.sage,
    backgroundColor: 'transparent',
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
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23, 48, 42, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
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
  sheetCancel: {
    marginTop: 10,
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
  primaryBtn: {
    borderRadius: radii.pill,
    backgroundColor: colors.teal,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
});
