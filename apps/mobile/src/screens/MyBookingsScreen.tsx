import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingsStackParams } from '../navigation/types';
import {
  PatientPage,
  LoadState,
  patientStyles as s,
} from '../components/PatientPage';
import {
  formatVisit,
  parseBooking,
  patientApi,
  PatientApiError,
} from '../features/patient/api';
import { usePatientResource } from '../features/patient/usePatientResource';
import { colors } from '../theme/tokens';

export function MyBookingsScreen({
  navigation,
  accessToken,
}: NativeStackScreenProps<BookingsStackParams, 'MyBookings'> & {
  accessToken?: string;
}) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const load = useCallback(
    async (signal: AbortSignal) => {
      const data = await patientApi(`/bookings/me?status=${tab}`, {
        token: accessToken,
        signal,
      });
      if (!Array.isArray(data))
        throw new PatientApiError(
          'We could not read your bookings. Please try again.',
        );
      return data.map(parseBooking);
    },
    [accessToken, tab],
  );
  const state = usePatientResource(load);
  return (
    <PatientPage>
      <View
        accessibilityRole="tablist"
        style={[
          s.row,
          {
            padding: 5,
            gap: 5,
            borderRadius: 12,
            backgroundColor: colors.tealTint,
          },
        ]}
      >
        {(['upcoming', 'past'] as const).map(value => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={{
              flex: 1,
              padding: 13,
              borderRadius: 9,
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
      {!state.loading && !state.error && state.data?.length === 0 ? (
        <View style={s.card}>
          <Text style={s.heading}>No {tab} bookings</Text>
          <Text style={s.text}>
            {tab === 'upcoming'
              ? 'Your next hospital appointment will appear here once booked.'
              : 'Your completed and cancelled appointments will appear here.'}
          </Text>
        </View>
      ) : null}
      {state.data?.map(booking => (
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
    </PatientPage>
  );
}
