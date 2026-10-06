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
import {
  colors,
  fonts,
  radii,
  surfaces,
  typography,
  spacing,
} from '../theme/tokens';

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
  const sessionGuidance = selected
    ? `Selected service: ${selected.name}`
    : state.status === 'ready' && state.servicesFailed
    ? 'Retry loading OPD services to continue.'
    : state.status === 'ready' && state.services.length === 0
    ? 'There is no OPD service to select at this hospital yet.'
    : 'Select an OPD service above to view its sessions.';
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
              <View style={styles.sessionAction}>
                <StatusText style={styles.guidance}>
                  {sessionGuidance}
                </StatusText>
                <ActionButton
                  label="View OPD sessions"
                  disabled={!selected}
                  accessibilityHint={
                    selected
                      ? `Shows sessions for ${selected.name}`
                      : sessionGuidance
                  }
                  onPress={() => {
                    if (selected) onViewSessions(selected.id);
                  }}
                />
                <Text style={styles.description}>
                  Session availability is checked in the next step. Selecting a
                  service does not reserve a place.
                </Text>
              </View>
            </View>
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.heading}>
                Opening hours
              </Text>
              <Text style={styles.description}>
                {state.hospital.openingHours ??
                  'Opening hours haven’t been provided. Please confirm with the hospital before your visit.'}
              </Text>
              {state.hospital.openingHours ? (
                <Text style={styles.description}>
                  OPD appointment times depend on the selected service and
                  session.
                </Text>
              ) : null}
            </View>
            <ActionButton
              label="Refresh hospital details"
              onPress={refresh}
              variant="outline"
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    ...surfaces.content,
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  section: { gap: spacing.sm },
  title: typography.title,
  heading: typography.heading,
  description: typography.body,
  card: {
    ...surfaces.card,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    padding: spacing.md,
    gap: spacing.md,
  },
  service: {
    borderRadius: radii.md,
    minHeight: 56,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selected: surfaces.selected,
  serviceName: {
    flexGrow: 1,
    flexShrink: 1,
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 23,
  },
  choice: {
    fontFamily: fonts.body,
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '600',
  },
  sessionAction: {
    borderRadius: radii.note,
    backgroundColor: colors.tealTint,
    padding: spacing.md,
    gap: spacing.md,
    alignSelf: 'stretch',
  },
  guidance: {
    fontFamily: fonts.body,
    color: colors.tealDark,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
  pressed: { borderColor: colors.tealDark, borderWidth: 2 },
});
