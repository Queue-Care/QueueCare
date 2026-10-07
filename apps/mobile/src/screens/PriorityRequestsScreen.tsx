import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces, shadows } from '../theme/tokens';
import { useApiResource } from '../api/g_useApiResource';
import {
  fetchPriorityRequests,
  formatTime,
  initials,
  reasonLabels,
  statusLabels,
  type PriorityFilter,
} from '../features/priority/g_priorityRequests';

type Props = {
  navigation: {
    navigate: (
      screen: 'PriorityRequestDetails',
      params: { requestId: string },
    ) => void;
  };
  accessToken?: string;
  onSessionExpired?: () => void;
  onPendingCount?: (count: number) => void;
};

export const PriorityRequestsScreen = ({
  navigation,
  accessToken,
  onSessionExpired,
  onPendingCount,
}: Props) => {
  const [tab, setTab] = useState<PriorityFilter>('pending');
  const load = useCallback(
    (signal: AbortSignal) => fetchPriorityRequests(accessToken, tab, signal),
    [accessToken, tab],
  );
  // README section 17: the staff inbox refreshes every 5–10 seconds while visible.
  const resource = useApiResource(load, {
    pollMs: 10000,
    onUnauthorized: onSessionExpired,
  });
  const { loading, error, reload } = resource;
  // After switching tabs, the other tab's rows are hidden until the new list arrives.
  const data = resource.data?.status === tab ? resource.data : undefined;
  const pendingCount = resource.data?.pendingCount;
  useEffect(() => {
    if (pendingCount !== undefined) onPendingCount?.(pendingCount);
  }, [pendingCount, onPendingCount]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.navHead}>
        <Text accessibilityRole="header" style={styles.navTitle}>
          Priority requests
        </Text>
      </View>

      <View style={styles.segmentWrap}>
        <View style={styles.segment}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              tab === 'pending' && styles.segmentActive,
            ]}
            accessibilityRole="tab"
            accessibilityLabel="Pending requests"
            accessibilityState={{ selected: tab === 'pending' }}
            onPress={() => setTab('pending')}
          >
            <Text
              style={[
                styles.segmentText,
                tab === 'pending' && styles.segmentTextActive,
              ]}
            >
              {pendingCount === undefined
                ? 'Pending'
                : `Pending · ${pendingCount}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              tab === 'decided' && styles.segmentActive,
            ]}
            accessibilityRole="tab"
            accessibilityLabel="Decided requests"
            accessibilityState={{ selected: tab === 'decided' }}
            onPress={() => setTab('decided')}
          >
            <Text
              style={[
                styles.segmentText,
                tab === 'decided' && styles.segmentTextActive,
              ]}
            >
              Decided
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!data}
            onRefresh={reload}
            tintColor={colors.teal}
          />
        }
      >
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
        ) : data && !data.requests.length ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>
              {tab === 'pending'
                ? 'No priority requests are waiting for review.'
                : 'No requests have been decided yet.'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {data?.requests.map(item => {
              const accepted = item.status === 'ACCEPTED';
              const pending = item.status === 'PENDING';
              return (
                <TouchableOpacity
                  key={item._id}
                  style={[styles.listRow, pending && styles.rowUnread]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.patient.fullName}, ${
                    reasonLabels[item.reason]
                  }, ${statusLabels[item.status]}`}
                  onPress={() =>
                    navigation.navigate('PriorityRequestDetails', {
                      requestId: item._id,
                    })
                  }
                >
                  <View
                    style={[
                      styles.avatar,
                      pending ? styles.avatarCoral : styles.avatarTeal,
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        pending
                          ? styles.avatarTextCoral
                          : styles.avatarTextTeal,
                      ]}
                    >
                      {initials(item.patient.fullName)}
                    </Text>
                  </View>

                  <View style={styles.grow}>
                    <Text style={styles.name}>{item.patient.fullName}</Text>
                    <Text style={styles.sub}>
                      {item.service.name}
                      {item.session.startsAt
                        ? ` · ${formatTime(item.session.startsAt)}`
                        : ''}
                    </Text>
                    {/* The reason stays visible without opening the request. */}
                    <Text style={styles.reason}>
                      {reasonLabels[item.reason]}
                    </Text>
                  </View>

                  <View
                    style={accepted ? styles.badgeDone : styles.badgePriority}
                  >
                    <View
                      style={
                        accepted ? styles.badgeDotDone : styles.badgeDotCoral
                      }
                    />
                    <Text
                      style={
                        accepted ? styles.badgeTextDone : styles.badgeTextCoral
                      }
                    >
                      {statusLabels[item.status]}
                    </Text>
                  </View>
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
  },
  navTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '700',
    color: colors.tealDark,
  },
  segmentWrap: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 4,
  },
  segment: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    backgroundColor: colors.tealTint,
    padding: 4,
  },
  segmentBtn: {
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.panel,
    ...shadows.segment,
  },
  segmentText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  segmentTextActive: {
    color: colors.tealDark,
  },
  scrollContent: {
    ...surfaces.content,
    paddingTop: 8,
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
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.sageLine,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  avatarCoral: {
    backgroundColor: colors.coralTint,
  },
  avatarTeal: {
    backgroundColor: colors.tealTint,
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 13,
  },
  avatarTextCoral: {
    color: '#A7402C',
  },
  avatarTextTeal: {
    color: colors.tealDark,
  },
  grow: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },
  reason: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 3,
  },
  badgePriority: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.coralTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDotCoral: {
    borderRadius: radii.circle,
    width: 6,
    height: 6,
    backgroundColor: colors.coral,
    marginRight: 5,
  },
  badgeTextCoral: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: '#A7402C',
  },
  badgeDone: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.doneBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDotDone: {
    borderRadius: radii.circle,
    width: 6,
    height: 6,
    backgroundColor: '#3C8558',
    marginRight: 5,
  },
  badgeTextDone: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: colors.doneText,
  },
});
