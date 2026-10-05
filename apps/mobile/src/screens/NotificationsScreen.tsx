import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces } from '../theme/tokens';

interface NotificationItem {
  id: string;
  title: string;
  sub: string;
  time: string;
  isUnread: boolean;
  isPriority?: boolean;
  avatarText?: string;
}

export const NotificationsScreen = ({ navigation }: any) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: '1',
      title: 'Priority request received',
      sub: 'Reception at Colombo National is reviewing it now.',
      time: '10 minutes ago',
      isUnread: true,
      isPriority: true,
    },
    {
      id: '2',
      title: 'Booking confirmed',
      sub: 'General OPD, 24 Sep at 8:30 AM.',
      time: 'Yesterday · 6:18 PM',
      isUnread: true,
      avatarText: 'OPD',
    },
    {
      id: '3',
      title: 'Appointment tomorrow',
      sub: 'Arrive by 8:15 AM and report to reception.',
      time: 'Yesterday · 7:00 AM',
      isUnread: true,
      avatarText: 'CNH',
    },
    {
      id: '4',
      title: 'Dermatology sessions reopened',
      sub: 'New slots released for the first week of October.',
      time: '20 Sep',
      isUnread: false,
      avatarText: 'OPD',
    },
  ]);

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navHead}>
        <Text style={styles.navTitle}>Notifications</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={markAllAsRead}>
          <Text style={styles.iconBtnCheck}>✓</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.list}>
          {notifications.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.listRow, item.isUnread && styles.rowUnread]}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.avatar,
                  item.isPriority ? styles.avatarCoral : styles.avatarTeal,
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    item.isPriority
                      ? styles.avatarTextCoral
                      : styles.avatarTextTeal,
                  ]}
                >
                  {item.isPriority ? '!' : item.avatarText || 'H'}
                </Text>
              </View>

              <View style={styles.contentWrap}>
                <Text style={styles.titleText}>{item.title}</Text>
                <Text style={styles.subText}>{item.sub}</Text>
                <Text style={styles.timestampText}>{item.time}</Text>
              </View>

              {item.isPriority && item.isUnread && (
                <View style={styles.priorityBadge}>
                  <View style={styles.badgeDot} />
                  <Text style={styles.priorityBadgeText}>New</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
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
    backgroundColor: colors.mist,
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
  iconBtnCheck: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.tealDark,
    fontWeight: 'bold',
  },
  scrollContent: {
    ...surfaces.content,
    paddingBottom: 24,
  },
  list: {
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.sageLine,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  rowUnread: {
    backgroundColor: '#F4FAF8',
  },
  avatar: {
    borderRadius: radii.circle,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarTeal: {
    backgroundColor: colors.tealTint,
  },
  avatarCoral: {
    backgroundColor: colors.coralTint,
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 13,
  },
  avatarTextTeal: {
    color: colors.tealDark,
  },
  avatarTextCoral: {
    color: '#A7402C',
  },
  contentWrap: {
    flex: 1,
  },
  titleText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  subText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
    marginTop: 2,
  },
  timestampText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 4,
  },
  priorityBadge: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.coralTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDot: {
    borderRadius: radii.circle,
    width: 6,
    height: 6,
    backgroundColor: colors.coral,
    marginRight: 5,
  },
  priorityBadgeText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: '#A7402C',
  },
});
//