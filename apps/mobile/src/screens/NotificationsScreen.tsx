import React, { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces } from '../theme/tokens';
import { ApiError, errorMessage } from '../api/g_apiClient';
import { useApiResource } from '../api/g_useApiResource';
import {
  deleteNotification,
  fetchNotifications,
  formatWhen,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationType,
} from '../features/notifications/g_notifications';

type Props = {
  accessToken?: string;
  onSessionExpired?: () => void;
  onUnreadCount?: (count: number) => void;
  // Staff open this screen from the dashboard, so it needs a way back.
  onBack?: () => void;
};

const avatarText: Record<NotificationType, string> = {
  BOOKING: 'OPD',
  REMINDER: '◷',
  QUEUE: 'Q',
  PRIORITY: '!',
  SESSION: 'OPD',
  SYSTEM: 'i',
};

export const NotificationsScreen = ({
  accessToken,
  onSessionExpired,
  onUnreadCount,
  onBack,
}: Props) => {
  const load = useCallback(
    (signal: AbortSignal) => fetchNotifications(accessToken, signal),
    [accessToken],
  );
  const { data, loading, error, reload, setData } = useApiResource(load, {
    pollMs: 15000,
    onUnauthorized: onSessionExpired,
  });
  const unreadCount = data?.unreadCount;
  useEffect(() => {
    if (unreadCount !== undefined) onUnreadCount?.(unreadCount);
  }, [unreadCount, onUnreadCount]);

  const failed = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401)
      onSessionExpired?.();
    Alert.alert('Notifications', errorMessage(failure));
    reload();
  };
  const show = (notifications: AppNotification[]) =>
    setData({
      notifications,
      unreadCount: notifications.filter(item => !item.readAt).length,
    });

  const markRead = async (item: AppNotification) => {
    if (!data || item.readAt) return;
    const readAt = new Date().toISOString();
    // Shown as read immediately; a failed save reloads the stored state.
    show(
      data.notifications.map(current =>
        current._id === item._id ? { ...current, readAt } : current,
      ),
    );
    try {
      await markNotificationRead(accessToken, item._id);
    } catch (failure) {
      failed(failure);
    }
  };

  const markAllRead = async () => {
    if (!data?.unreadCount) return;
    const readAt = new Date().toISOString();
    show(
      data.notifications.map(item => ({
        ...item,
        readAt: item.readAt ?? readAt,
      })),
    );
    try {
      await markAllNotificationsRead(accessToken);
    } catch (failure) {
      failed(failure);
    }
  };

  const remove = (item: AppNotification) =>
    Alert.alert('Delete this notification?', item.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!data) return;
          show(data.notifications.filter(current => current._id !== item._id));
          try {
            await deleteNotification(accessToken, item._id);
          } catch (failure) {
            failed(failure);
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.navHead}>
        {onBack ? (
          <TouchableOpacity
            style={[styles.iconBtn, styles.backBtn]}
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
          >
            <Text style={styles.backBtnArrow}>‹</Text>
          </TouchableOpacity>
        ) : null}
        <Text accessibilityRole="header" style={styles.navTitle}>
          Notifications
        </Text>
        <TouchableOpacity
          style={[styles.iconBtn, !data?.unreadCount && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Mark all as read"
          accessibilityState={{ disabled: !data?.unreadCount }}
          disabled={!data?.unreadCount}
          onPress={markAllRead}
        >
          <Text style={styles.iconBtnCheck}>✓</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading && !data ? (
          <ActivityIndicator style={styles.state} color={colors.teal} />
        ) : error && !data ? (
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
        ) : data && !data.notifications.length ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>
              You have no notifications yet. Booking, priority and session
              updates will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {data?.notifications.map(item => {
              const unread = !item.readAt;
              const priority = item.type === 'PRIORITY';
              return (
                <TouchableOpacity
                  key={item._id}
                  style={[styles.listRow, unread && styles.rowUnread]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.message}${
                    unread ? ' Unread.' : ''
                  }`}
                  accessibilityHint="Press to mark as read. Long press to delete."
                  onPress={() => void markRead(item)}
                  onLongPress={() => remove(item)}
                >
                  <View
                    style={[
                      styles.avatar,
                      priority ? styles.avatarCoral : styles.avatarTeal,
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        priority
                          ? styles.avatarTextCoral
                          : styles.avatarTextTeal,
                      ]}
                    >
                      {avatarText[item.type]}
                    </Text>
                  </View>

                  <View style={styles.contentWrap}>
                    <Text style={styles.titleText}>{item.title}</Text>
                    <Text style={styles.subText}>{item.message}</Text>
                    <Text style={styles.timestampText}>
                      {formatWhen(item.createdAt)}
                    </Text>
                  </View>

                  {unread ? (
                    <View style={styles.priorityBadge}>
                      <View style={styles.badgeDot} />
                      <Text style={styles.priorityBadgeText}>New</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
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
    flex: 1,
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
  backBtn: {
    marginRight: 14,
  },
  backBtnArrow: {
    fontFamily: fonts.body,
    fontSize: 24,
    color: colors.tealDark,
    lineHeight: 28,
  },
  iconBtnCheck: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.tealDark,
    fontWeight: 'bold',
  },
  disabled: {
    opacity: 0.45,
  },
  scrollContent: {
    ...surfaces.content,
    paddingBottom: 24,
  },
  state: {
    paddingHorizontal: 22,
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
  list: {
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.panel,
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
