import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, surfaces } from '../theme/tokens';
import { ApiError, errorMessage } from '../api/g_apiClient';
import { useApiResource } from '../api/g_useApiResource';
import {
  decidePriorityRequest,
  fetchPriorityRequest,
  formatSession,
  initials,
  reasonLabels,
  statusLabels,
} from '../features/priority/g_priorityRequests';
import { useT } from '../i18n/g_language';

type Props = {
  route: { params: { requestId: string } };
  navigation: { goBack: () => void };
  accessToken?: string;
  onSessionExpired?: () => void;
};

export const PriorityRequestDetailsScreen = ({
  route,
  navigation,
  accessToken,
  onSessionExpired,
}: Props) => {
  const { requestId } = route.params;
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchPriorityRequest(accessToken, requestId, signal),
    [accessToken, requestId],
  );
  const {
    data: item,
    loading,
    error,
    reload,
    setData,
  } = useApiResource(load, { onUnauthorized: onSessionExpired });
  const [saving, setSaving] = useState<'ACCEPTED' | 'DECLINED' | null>(null);

  const decide = async (decision: 'ACCEPTED' | 'DECLINED') => {
    setSaving(decision);
    try {
      setData(await decidePriorityRequest(accessToken, requestId, decision));
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401)
        onSessionExpired?.();
      // Another staff member may have decided first; show the saved decision.
      else if (failure instanceof ApiError && failure.status === 409) reload();
      Alert.alert(t('Could not save the decision'), t(errorMessage(failure)));
    } finally {
      setSaving(null);
    }
  };

  const confirm = (decision: 'ACCEPTED' | 'DECLINED') => {
    const accepting = decision === 'ACCEPTED';
    Alert.alert(
      t(accepting ? 'Accept this request?' : 'Decline this request?'),
      t(
        accepting
          ? '{name} will be moved to the priority queue and notified.'
          : '{name} will be notified. The booking stays confirmed.',
        { name: item?.patient.fullName },
      ),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t(accepting ? 'Accept' : 'Decline'),
          style: accepting ? 'default' : 'destructive',
          onPress: () => void decide(decision),
        },
      ],
    );
  };

  const pending = item?.status === 'PENDING';
  const accepted = item?.status === 'ACCEPTED';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.navHead}>
        <TouchableOpacity
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to priority requests"
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backBtnArrow}>‹</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.navTitle}>
          {t('Request details')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {loading && !item ? (
          <ActivityIndicator style={styles.state} color={colors.teal} />
        ) : null}
        {error && !item ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>{t(error)}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={reload}
            >
              <Text style={styles.stateLink}>{t('Try again')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {item ? (
          <>
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.avatar, !pending && styles.avatarTeal]}>
                  <Text
                    style={[
                      styles.avatarText,
                      !pending && styles.avatarTextTeal,
                    ]}
                  >
                    {initials(item.patient.fullName)}
                  </Text>
                </View>
                <View style={styles.cardHeaderInfo}>
                  <Text style={styles.patientName}>
                    {item.patient.fullName}
                  </Text>
                  <Text style={styles.patientSub}>
                    {[
                      item.patient.maskedNic && `NIC ${item.patient.maskedNic}`,
                      item.patient.phone,
                    ]
                      .filter(Boolean)
                      .join(' · ') || t('Contact details unavailable')}
                  </Text>
                </View>
                <View
                  style={accepted ? styles.badgeDone : styles.badgePriority}
                >
                  <View
                    style={[styles.badgeDot, accepted && styles.badgeDotDone]}
                  />
                  <Text
                    style={
                      accepted ? styles.badgeDoneText : styles.badgePriorityText
                    }
                  >
                    {t(statusLabels[item.status])}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.kv}>
                <Text style={styles.k}>{t('Booking')}</Text>
                <Text style={[styles.v, styles.mono]}>
                  {item.booking.bookingCode ?? t('Unavailable')}
                </Text>
              </View>
              <View style={styles.kv}>
                <Text style={styles.k}>{t('Service')}</Text>
                <Text style={styles.v}>{item.service.name}</Text>
              </View>
              {item.booking.assignedTime ? <View style={styles.kv}>
                <Text style={styles.k}>{t('Appointment time')}</Text>
                <Text style={styles.v}>{formatSession(item.booking.assignedTime)} · {t(item.booking.queueType === 'PRIORITY' ? 'Priority' : 'Normal')}</Text>
              </View> : null}
              <View style={[styles.kv, styles.kvLast]}>
                <Text style={styles.k}>{t('Session')}</Text>
                <Text style={styles.v}>
                  {t(formatSession(item.session.startsAt))}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardHeading}>{t('Reason given')}</Text>
              <Text style={styles.reasonMain}>{t(reasonLabels[item.reason])}</Text>
              {item.note ? (
                <Text style={styles.reasonQuote}>{`"${item.note}"`}</Text>
              ) : null}
            </View>

            {pending ? (
              <>
                <View style={styles.note}>
                  <Text style={styles.infoIcon}>ℹ</Text>
                  <Text style={styles.noteText}>
                    {t(
                      'The patient is notified as soon as you decide, and the queue order updates immediately.',
                    )}
                  </Text>
                </View>

                <View style={styles.spacer} />

                <TouchableOpacity
                  style={[styles.btnPrimary, saving && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Accept request"
                  disabled={saving !== null}
                  onPress={() => confirm('ACCEPTED')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnPrimaryText}>
                    {t(saving === 'ACCEPTED' ? 'Accepting…' : 'Accept request')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnDangerGhost, saving && styles.disabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Decline request"
                  disabled={saving !== null}
                  onPress={() => confirm('DECLINED')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnDangerGhostText}>
                    {t(saving === 'DECLINED' ? 'Declining…' : 'Decline request')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.note}>
                <Text style={styles.infoIcon}>ℹ</Text>
                <Text style={styles.noteText}>
                  {t(
                    accepted
                      ? 'Request accepted. The patient has been notified and is admitted through the priority queue.'
                      : 'Request declined. The patient has been notified and keeps the confirmed booking.',
                  )}
                  {item.reviewedAt
                    ? ` ${t('Decided {when}.', {
                        when: formatSession(item.reviewedAt),
                      })}`
                    : ''}
                  {item.decisionNote ? ` ${item.decisionNote}` : ''}
                </Text>
              </View>
            )}
          </>
        ) : null}
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
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 24,
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
  card: {
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    borderRadius: radii.circle,
    width: 46,
    height: 46,
    backgroundColor: colors.coralTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTeal: {
    backgroundColor: colors.tealTint,
  },
  avatarText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
    color: '#A7402C',
  },
  avatarTextTeal: {
    color: colors.tealDark,
  },
  cardHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  patientName: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  patientSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  badgePriority: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.coralTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeDone: {
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.doneBg,
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
  badgeDotDone: {
    backgroundColor: '#3C8558',
  },
  badgePriorityText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: '#A7402C',
  },
  badgeDoneText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: colors.doneText,
  },
  divider: {
    height: 1,
    backgroundColor: colors.sageLine,
    marginVertical: 14,
  },
  kv: {
    marginBottom: 12,
  },
  kvLast: {
    marginBottom: 0,
  },
  k: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 2,
  },
  v: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '500',
    color: colors.ink,
  },
  mono: {
    fontFamily: fonts.mono,
  },
  cardHeading: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  reasonMain: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    marginTop: 6,
    fontWeight: '500',
  },
  reasonQuote: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 8,
    lineHeight: 18,
  },
  note: {
    borderRadius: radii.note,
    backgroundColor: colors.tealTint,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 12,
  },
  infoIcon: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.tealDark,
    marginRight: 8,
  },
  noteText: {
    fontFamily: fonts.body,
    flex: 1,
    fontSize: 12,
    color: colors.tealDark,
    lineHeight: 17,
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  btnPrimary: {
    borderRadius: radii.pill,
    backgroundColor: colors.teal,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnDangerGhost: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.coralTint,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDangerGhostText: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
    color: '#A7402C',
  },
  disabled: {
    opacity: 0.6,
  },
});
