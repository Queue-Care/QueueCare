import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

export const StaffSignInScreen = ({ navigation }: any) => {
  const [staffId, setStaffId] = useState('CNH-RC-0421');
  const [password, setPassword] = useState('••••••••••');
  const [hospital, setHospital] = useState('Colombo National Hospital');

  const handleSignIn = () => {
    Alert.alert('Staff Sign In', `Signing in with Staff ID: ${staffId}`);
  };

  const handleRequestAccount = () => {
    navigation?.navigate?.('StaffRegistration');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navHead}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation?.goBack?.()}
        >
          <Text style={styles.backBtnArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
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
            style={[styles.control, styles.mono]}
            value={staffId}
            onChangeText={setStaffId}
            autoCapitalize="characters"
          />
        </View>

        {/* Password Field */}
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.control, styles.controlFocused]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* Hospital Dropdown */}
        <View style={styles.field}>
          <Text style={styles.label}>Hospital</Text>
          <TouchableOpacity style={styles.controlDropdown} activeOpacity={0.7}>
            <Text style={styles.dropdownValue}>{hospital}</Text>
            <Text style={styles.chev}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Sign In Button */}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleSignIn}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>Sign in</Text>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7}>
          <Text style={styles.linkText}>Reset password</Text>
        </TouchableOpacity>

        <View style={styles.spacerMiddle} />

        {/* Warning Note Banner */}
        <View style={styles.noteWarn}>
          <Text style={styles.warnIcon}>⚠</Text>
          <Text style={styles.warnText}>
            Staff accounts are approved by the hospital administrator before first use.
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
    width: 38,
    height: 38,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnArrow: {
    fontSize: 24,
    color: colors.tealDark,
    lineHeight: 28,
  },
  titleWrap: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 28,
    flexGrow: 1,
  },
  markTint: {
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
    fontSize: 28,
    color: colors.tealDark,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.tealDark,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  lede: {
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
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
  },
  control: {
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
    fontSize: 14,
    color: colors.ink,
  },
  chev: {
    fontSize: 10,
    color: colors.inkSoft,
  },
  mono: {
    fontFamily: 'monospace',
  },
  btnPrimary: {
    backgroundColor: colors.teal,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  btnPrimaryText: {
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
    backgroundColor: colors.amberTint,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  warnIcon: {
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
    borderWidth: 1,
    borderColor: colors.sage,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.tealDark,
  },
});
