import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { StatusText } from '../components/StatusText';
import { useHospitalDetails } from '../features/hospitals/useHospitalDetails';
import { colors, fonts, spacing } from '../theme/tokens';

export function HospitalDetailsScreen({
  hospitalId,
  onSearch,
  onViewSessions,
}: {
  hospitalId: string;
  onSearch: () => void;
  onViewSessions: (serviceId: string) => void;
}) {
  const { state, reload } = useHospitalDetails(hospitalId);
  const [selection, setSelection] = useState<{
    hospitalId: string;
    serviceId: string;
  } | null>(null);
  const selected =
    state.status === 'ready' &&
    !state.servicesFailed &&
    selection?.hospitalId === hospitalId
      ? state.services.find(service => service.id === selection.serviceId)
      : undefined;
  const refresh = () => {
    setSelection(null);
    reload();
  };
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'loading'}
            onRefresh={refresh}
            tintColor={colors.teal}
          />
        }
      >
        {state.status === 'loading' ? (
          <View style={styles.card}>
            <ActivityIndicator
              color={colors.teal}
              accessible={false}
              importantForAccessibility="no"
            />
            <StatusText
              style={styles.description}
              accessibilityState={{ busy: true }}
            >
              Loading hospital details…
            </StatusText>
          </View>
        ) : state.status === 'unavailable' ? (
          <View style={styles.card}>
            <StatusText accessibilityRole="header" style={styles.heading}>
              Hospital unavailable
            </StatusText>
            <Text style={styles.description}>
              This hospital could not be found or is no longer listed. Please
              choose another hospital.
            </Text>
            <ActionButton label="Search hospitals" onPress={onSearch} />
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.card}>
            <StatusText accessibilityRole="alert" style={styles.heading}>
              We couldn’t load this hospital
            </StatusText>
            <Text style={styles.description}>
              Please check your connection and try again.
            </Text>
            <ActionButton
              label="Try again"
              onPress={refresh}
              variant="outline"
            />
          </View>
        ) : state.status === 'ready' ? (
          <>
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.title}>
                {state.hospital.name}
              </Text>
              <Text style={styles.description}>{state.hospital.address}</Text>
              <Text style={styles.description}>{state.hospital.city}</Text>
              {state.hospital.phone && (
                <Text selectable style={styles.description}>
                  Phone: {state.hospital.phone}
                </Text>
              )}
            </View>
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.heading}>
                OPD services
              </Text>
              {!state.servicesFailed && state.services.length > 0 && (
                <StatusText style={styles.description}>
                  {`${state.services.length} OPD ${
                    state.services.length === 1 ? 'service' : 'services'
                  } available. Select one to continue.`}
                </StatusText>
              )}
              {state.servicesFailed ? (
                <>
                  <StatusText
                    accessibilityRole="alert"
                    style={styles.description}
                  >
                    We couldn’t load OPD services.
                  </StatusText>
                  <ActionButton
                    label="Retry services"
                    onPress={refresh}
                    variant="outline"
                  />
                </>
              ) : state.services.length === 0 ? (
                <>
                  <StatusText style={styles.description}>
                    No OPD services listed yet.
                  </StatusText>
                  <Text style={styles.description}>
                    Please check again later or choose another hospital.
                  </Text>
                  <ActionButton
                    label="Search hospitals"
                    onPress={onSearch}
                    variant="outline"
                  />
                </>
              ) : (
                state.services.map(service => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="radio"
                    accessibilityLabel={service.name}
                    accessibilityState={{
                      checked: selected?.id === service.id,
                    }}
                    accessibilityHint="Selects this OPD service"
                    onPress={() =>
                      setSelection({ hospitalId, serviceId: service.id })
                    }
                    style={({ pressed }) => [
                      styles.service,
                      selected?.id === service.id && styles.selected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.choice}>
                      {selected?.id === service.id ? 'Selected' : 'Select'}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.heading}>
                Opening hours
              </Text>
              <Text style={styles.description}>
                Opening hours haven’t been provided. Please confirm with the
                hospital before your visit.
              </Text>
            </View>
            <View style={styles.note}>
              <Text style={styles.description}>
                Choose an OPD service to continue. Session availability has not
                been checked yet.
              </Text>
            </View>
            <View style={styles.action}>
              <ActionButton
                label="Refresh hospital details"
                onPress={refresh}
                variant="outline"
              />
              <ActionButton
                label="View OPD sessions"
                disabled={!selected}
                accessibilityHint={
                  selected
                    ? `Shows sessions for ${selected.name}`
                    : 'Select an OPD service above to continue'
                }
                onPress={() => {
                  if (selected) onViewSessions(selected.id);
                }}
              />
              {!selected && (
                <Text style={styles.helper}>
                  Select an available service above to continue.
                </Text>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  section: { gap: spacing.sm },
  title: {
    fontFamily: fonts.display,
    color: colors.tealDark,
    fontSize: 30,
    lineHeight: 39,
  },
  heading: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 28,
  },
  description: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 16,
    lineHeight: 25,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    padding: spacing.md,
    gap: spacing.md,
  },
  service: {
    minHeight: 56,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selected: { borderColor: colors.teal, backgroundColor: colors.tealTint },
  serviceName: {
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 25,
  },
  choice: {
    fontFamily: fonts.body,
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '600',
  },
  note: { backgroundColor: colors.tealTint, padding: spacing.md },
  action: { gap: spacing.sm, marginTop: 'auto', paddingTop: spacing.md },
  helper: {
    fontFamily: fonts.body,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  pressed: { borderColor: colors.tealDark, borderWidth: 2 },
});
