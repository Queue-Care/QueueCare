import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces } from '../theme/tokens';

export const ProfileScreen = ({ navigation, onSignOut }: any) => {
  const menuOptions = [
    { label: 'Personal information', rightValue: '' },
    { label: 'Notification settings', rightValue: '' },
    { label: 'Language', rightValue: 'English' },
    { label: 'Saved hospitals', rightValue: '' },
    { label: 'Help and support', rightValue: '' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navHead}>
        <Text style={styles.navTitle}>Profile</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.cardHeader}>
          <View style={styles.avatarLg}>
            <Text style={styles.avatarLgText}>KP</Text>
          </View>
          <Text style={styles.nameText}>Kasun Perera</Text>
          <Text style={styles.subText}>NIC ········234V · +94 77 123 4567</Text>
        </View>

        <View style={styles.list}>
          {menuOptions.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.listRow,
                index === menuOptions.length - 1 && styles.lastListRow,
              ]}
              activeOpacity={0.7}
            >
              <Text style={styles.rowLabel}>{item.label}</Text>
              {item.rightValue ? (
                <Text style={styles.rightValueText}>{item.rightValue}</Text>
              ) : null}
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={onSignOut}
          activeOpacity={0.8}
        >
          <Text style={styles.outlineBtnText}>Sign out</Text>
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
});