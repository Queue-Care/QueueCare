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
import { colors, fonts, radii, surfaces } from '../theme/tokens';

export const StaffRegistrationScreen = ({ navigation }: any) => {
  const [form, setForm] = useState({
    fullName: 'Nimasha Fernando',
    staffId: 'CNH-RC-0421',
    hospital: 'Colombo National Hospital',
    role: 'Reception',
    mobile: '+94 71 998 2210',
    email: 'n.fernando@health.gov.lk',
    password: '',
  });

  const handleSubmit = () => {
    Alert.alert(
      'Request Submitted',
      'Your request has been routed to the hospital administration for approval.'
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navHead}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation?.goBack()}
        >
          <Text style={styles.backBtnArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Request access</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.lede}>
          Your administrator approves the account before you can sign in.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.control}
            value={form.fullName}
            onChangeText={(t) => setForm({ ...form, fullName: t })}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Staff ID</Text>
          <TextInput
            style={[styles.control, styles.monoText]}
            value={form.staffId}
            onChangeText={(t) => setForm({ ...form, staffId: t })}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Hospital</Text>
          <TouchableOpacity style={styles.selectControl}>
            <Text style={styles.selectValue}>{form.hospital}</Text>
            <Text style={styles.chev}>▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Role</Text>
          <TouchableOpacity style={styles.selectControl}>
            <Text style={styles.selectValue}>{form.role}</Text>
            <Text style={styles.chev}>▼</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Mobile number</Text>
          <TextInput
            style={styles.control}
            keyboardType="phone-pad"
            value={form.mobile}
            onChangeText={(t) => setForm({ ...form, mobile: t })}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Work email</Text>
          <TextInput
            style={styles.control}
            keyboardType="email-address"
            autoCapitalize="none"
            value={form.email}
            onChangeText={(t) => setForm({ ...form, email: t })}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Create password</Text>
          <TextInput
            style={styles.control}
            secureTextEntry
            placeholder="At least 8 characters"
            placeholderTextColor="#9CB0AA"
            value={form.password}
            onChangeText={(t) => setForm({ ...form, password: t })}
          />
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleSubmit}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>Send for approval</Text>
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
});