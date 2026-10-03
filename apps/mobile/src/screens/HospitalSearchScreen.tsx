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
import { useHospitalSearch } from '../features/hospitals/useHospitalSearch';
import { colors, fonts, radii, spacing } from '../theme/tokens';

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
              <View accessibilityLiveRegion="polite" style={styles.section}>
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
                <Text style={styles.description}>
                  {state.total} {state.total === 1 ? 'hospital' : 'hospitals'}{' '}
                  found
                </Text>
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
              <View
                accessible
                accessibilityLabel="Loading hospitals"
                accessibilityState={{ busy: true }}
                style={styles.section}
              >
                <ActivityIndicator color={colors.teal} />
                <Text style={styles.description}>Loading hospitals…</Text>
              </View>
            ) : state.status === 'error' ? (
              <>
                <Text accessibilityRole="alert" style={styles.heading}>
                  We couldn’t load hospitals
                </Text>
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
                <Text style={styles.heading}>
                  {filtered
                    ? 'No hospitals match your search'
                    : 'No hospitals available yet'}
                </Text>
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
                <View
                  accessible
                  accessibilityLabel="Loading more hospitals"
                  accessibilityState={{ busy: true }}
                >
                  <ActivityIndicator color={colors.teal} />
                </View>
              ) : state.page >= 1000 ? (
                <Text style={styles.description}>
                  Narrow your search by name or city to see more hospitals.
                </Text>
              ) : (
                <>
                  {state.moreError && (
                    <Text accessibilityRole="alert" style={styles.description}>
                      We couldn’t load more hospitals. Your results are still
                      here.
                    </Text>
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
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flexGrow: 1,
  },
  section: { gap: spacing.md },
  title: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 40,
  },
  heading: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '600',
  },
  description: {
    color: colors.inkSoft,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 25,
  },
  label: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600',
  },
  filters: { gap: spacing.sm, paddingVertical: spacing.sm },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.sage,
    borderRadius: radii.sm,
    backgroundColor: colors.panel,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 16,
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: radii.md,
    padding: spacing.lg,
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
  pressed: { opacity: 0.78 },
});
