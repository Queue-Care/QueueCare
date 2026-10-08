import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingsStackParams } from '../navigation/types';
import {
  PatientPage,
  LoadState,
  patientStyles as s,
} from '../components/PatientPage';
import { formatVisit } from '../features/patient/api';
import { usePatientResource } from '../features/patient/usePatientResource';
import { colors, radii, shadows } from '../theme/tokens';
import { ActionButton } from '../components/ActionButton';
import { getPatientBookings } from '../features/patient/bookings';

export function MyBookingsScreen({
  navigation,
  accessToken,
}: NativeStackScreenProps<BookingsStackParams, 'MyBookings'> & {
  accessToken?: string;
}) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [page, setPage] = useState(1);
  const load = useCallback(
    (signal: AbortSignal) => getPatientBookings(accessToken, tab, page, signal),
    [accessToken, tab, page],
  );
  const state = usePatientResource(load);
  return (
    <PatientPage
      refreshing={state.loading && !!state.data}
      onRefresh={state.reload}
    >
      <View
        accessibilityRole="tablist"
        style={[
          s.row,
          {
            padding: 5,
            gap: 5,
            borderRadius: radii.pill,
            backgroundColor: colors.tealTint,
          },
        ]}
      >
        {(['upcoming', 'past'] as const).map(value => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            onPress={() => {
              setPage(1);
              setTab(value);
            }}
            style={{
              ...(tab === value ? shadows.segment : {}),
              flex: 1,
              padding: 13,
              borderRadius: radii.pill,
              alignItems: 'center',
              backgroundColor: tab === value ? colors.panel : 'transparent',
            }}
          >
            <Text style={s.label}>
              {value === 'upcoming' ? 'Upcoming' : 'Past'}
            </Text>
          </Pressable>
        ))}
      </View>
      <LoadState
        loading={state.loading}
        error={state.error}
        retry={state.reload}
      />
      {!state.loading && !state.error && state.data?.bookings.length === 0 ? (
        <View style={s.card}>
          <Text style={s.heading}>
            {page === 1 ? `No ${tab} bookings` : 'No bookings on this page'}
          </Text>
          <Text style={s.text}>
            {tab === 'upcoming'
              ? 'Your next hospital appointment will appear here once booked.'
              : 'Your completed and cancelled appointments will appear here.'}
          </Text>
        </View>
      ) : null}
      {state.data?.bookings.map(booking => (
        <Pressable
          key={booking._id}
          accessibilityRole="button"
          accessibilityLabel={`View ${booking.serviceName} booking ${booking.bookingCode}`}
          onPress={() =>
            navigation.navigate('BookingDetails', { bookingId: booking._id })
          }
          style={s.card}
        >
          <View style={s.row}>
            <Text style={[s.heading, { flex: 1 }]}>{booking.serviceName}</Text>
            <Text style={s.badge}>
              {booking.status
                .toLowerCase()
                .replace(/^./, letter => letter.toUpperCase())}
            </Text>
          </View>
          <Text style={s.text}>{booking.hospitalName}</Text>
          <View style={s.divider} />
          <Text style={s.small}>{formatVisit(booking.startsAt)}</Text>
          <Text style={[s.small, { letterSpacing: 1 }]}>
            {booking.bookingCode}
          </Text>
        </Pressable>
      ))}
      {!state.loading && state.data && (
        <View style={{ gap: 12 }}>
          <Text style={s.small}>
            {`Page ${page} · ${state.data.total} ${tab} bookings`}
          </Text>
          {page > 1 && (
            <ActionButton
              label="Previous bookings"
              variant="outline"
              onPress={() => setPage(page - 1)}
            />
          )}
          {state.data.hasNextPage && (
            <ActionButton
              label="Next bookings"
              variant="outline"
              onPress={() => setPage(page + 1)}
            />
          )}
        </View>
      )}
    </PatientPage>
  );
}
