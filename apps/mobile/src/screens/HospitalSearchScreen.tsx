import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { StatusText } from '../components/StatusText';
import { useHospitalSearch } from '../features/hospitals/useHospitalSearch';
import { colors, fonts, surfaces, typography, radii, spacing } from '../theme/tokens';

export function HospitalSearchScreen({
  onSelectHospital,
}: {
  onSelectHospital: (hospitalId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [submitted, setSubmitted] = useState({
    search: '',
    city: '',
  });
  const { state, reload, loadMore } = useHospitalSearch(submitted);
  function submit(clear = false) {
    Keyboard.dismiss();
    if (clear) {
      setSearch('');
      setCity('');
    }
    setSubmitted({
      search: clear ? '' : search.trim(),
      city: clear ? '' : city.trim(),
    });
  }
  const filtered = Boolean(submitted.search || submitted.city);
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={state.hospitals}
        keyExtractor={hospital => hospital.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'loading'}
            onRefresh={reload}
            tintColor={colors.teal}
          />
        }
        ListHeaderComponent={
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.title}>
              Find a hospital
            </Text>
            <Text style={styles.description}>
              Search by hospital name or city to plan your OPD visit.
            </Text>
            <View style={styles.filters}>
              <Text style={styles.label}>Hospital name or city</Text>
              <TextInput
                accessibilityLabel="Hospital name or city"
                accessibilityHint="Enter a name or city, then choose Find hospitals"
                placeholder="Search hospitals"
                placeholderTextColor={colors.inkSoft}
                style={styles.input}
                value={search}
                onChangeText={setSearch}
                maxLength={100}
                returnKeyType="search"
                onSubmitEditing={() => submit()}
                autoCorrect={false}
              />
              <Text style={styles.label}>City (optional)</Text>
              <TextInput
                accessibilityLabel="City filter"
                placeholder="Enter a city, e.g. Colombo"
                placeholderTextColor={colors.inkSoft}
                style={styles.input}
                value={city}
                onChangeText={setCity}
                maxLength={80}
                returnKeyType="search"
                onSubmitEditing={() => submit()}
                autoCorrect={false}
              />
              <ActionButton label="Find hospitals" onPress={() => submit()} />
              {search || city || filtered ? (
                <ActionButton
                  label="Clear filters"
                  onPress={() => submit(true)}
                  variant="outline"
                />
              ) : null}
            </View>
            {state.status === 'ready' && (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.heading}>
                  {filtered ? 'Search results' : 'All hospitals'}
                </Text>
                {filtered && (
                  <Text style={styles.description}>
                    {[
                      submitted.search && `Search: ${submitted.search}`,
                      submitted.city && `City: ${submitted.city}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
                <StatusText style={styles.description}>
                  {`${state.total} ${
                    state.total === 1 ? 'hospital' : 'hospitals'
                  } found. ${state.hospitals.length} shown.`}
                </StatusText>
                <ActionButton
                  label="Refresh hospitals"
                  variant="outline"
                  onPress={reload}
                />
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${item.name}, ${item.city}`}
            accessibilityHint="Opens hospital details"
            onPress={() => onSelectHospital(item.id)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.heading}>{item.name}</Text>
            <Text style={styles.city}>{item.city}</Text>
            <Text style={styles.description}>{item.address}</Text>
            <Text style={styles.link}>View hospital →</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.card}>
            {state.status === 'loading' ? (
              <View style={styles.section}>
                <ActivityIndicator
                  color={colors.teal}
                  accessible={false}
                  importantForAccessibility="no"
                />
                <StatusText
                  style={styles.description}
                  accessibilityState={{ busy: true }}
                >
                  Loading hospitals…
                </StatusText>
              </View>
            ) : state.status === 'error' ? (
              <>
                <StatusText accessibilityRole="alert" style={styles.heading}>
                  We couldn’t load hospitals
                </StatusText>
                <Text style={styles.description}>
                  Please check your connection and try again.
                </Text>
                <ActionButton
                  label="Try again"
                  onPress={reload}
                  variant="outline"
                />
              </>
            ) : (
              <>
                <StatusText style={styles.heading}>
                  {filtered
                    ? 'No hospitals match your search'
                    : 'No hospitals available yet'}
                </StatusText>
                <Text style={styles.description}>
                  {filtered
                    ? 'Try another name or city, or clear the filters.'
                    : 'Please check again later.'}
                </Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={
          state.status === 'ready' && state.hasNextPage ? (
            <View style={styles.section}>
              {state.loadingMore ? (
                <View>
                  <ActivityIndicator
                    color={colors.teal}
                    accessible={false}
                    importantForAccessibility="no"
                  />
                  <StatusText
                    style={styles.description}
                    accessibilityState={{ busy: true }}
                  >
                    Loading more hospitals
                  </StatusText>
                </View>
              ) : state.page >= 1000 ? (
                <Text style={styles.description}>
                  Narrow your search by name or city to see more hospitals.
                </Text>
              ) : (
                <>
                  {state.moreError && (
                    <StatusText
                      accessibilityRole="alert"
                      style={styles.description}
                    >
                      We couldn’t load more hospitals. Your results are still
                      here.
                    </StatusText>
                  )}
                  <ActionButton
                    label={
                      state.moreError
                        ? 'Retry loading more'
                        : 'Load more hospitals'
                    }
                    onPress={loadMore}
                    variant="outline"
                  />
                </>
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.mist },
  content: {
    ...surfaces.content,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexGrow: 1,
  },
  section: { gap: spacing.md },
  title: typography.title,
  heading: typography.heading,
  description: typography.body,
  label: typography.label,
  filters: { gap: spacing.sm, paddingVertical: spacing.sm },
  input: {
    fontFamily: fonts.body,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  card: {
    ...surfaces.card,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.md,
    padding: 16,
    gap: spacing.sm,
  },
  city: {
    color: colors.tealDark,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
  },
  link: {
    color: colors.teal,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  pressed: { borderColor: colors.tealDark, borderWidth: 2 },
});
