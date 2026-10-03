import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingsStackParams } from '../navigation/types';
import {
  DetailRow,
  LoadState,
  Note,
  PatientPage,
  patientStyles as s,
} from '../components/PatientPage';
import { ActionButton } from '../components/ActionButton';
import {
  formatVisit,
  message,
  parseBooking,
  patientApi,
  PatientApiError,
} from '../features/patient/api';
import { usePatientResource } from '../features/patient/usePatientResource';
import { colors } from '../theme/tokens';

export function BookingDetailsScreen({
  route,
  navigation,
  accessToken,
}: NativeStackScreenProps<BookingsStackParams, 'BookingDetails'> & {
  accessToken?: string;
}) {
  const id = route.params.bookingId;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const booking = parseBooking(
        await patientApi(`/bookings/${encodeURIComponent(id)}`, {
          token: accessToken,
          signal,
        }),
      );
      if (booking._id !== id)
        throw new PatientApiError('We could not find this booking.');
      return booking;
    },
    [id, accessToken],
  );
  const state = usePatientResource(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await patientApi(`/bookings/${encodeURIComponent(id)}/cancel`, {
        token: accessToken,
        method: 'PATCH',
      });
      state.reload();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  const booking = state.data;
  return (
    <PatientPage>
      <LoadState
        loading={state.loading}
        error={state.error}
        retry={state.reload}
      />
      {booking ? (
        <>
          <View style={s.ticket}>
            <Text style={{ color: colors.tealTint }}>Booking ID</Text>
            <Text style={s.ticketCode}>{booking.bookingCode}</Text>
            <View style={[s.divider, { alignSelf: 'stretch', opacity: 0.3 }]} />
            <Text style={{ color: colors.panel, textAlign: 'center' }}>
              {formatVisit(booking.startsAt)}
            </Text>
          </View>
          <View style={s.card}>
            <DetailRow label="Hospital" value={booking.hospitalName} />
            <DetailRow label="Service" value={booking.serviceName} />
            {booking.patientName ? (
              <DetailRow
                label="Patient"
                value={`${booking.patientName}${
                  booking.maskedNic ? ` · NIC ${booking.maskedNic}` : ''
                }`}
              />
            ) : null}
            <DetailRow
              label="Status"
              value={booking.status
                .toLowerCase()
                .replace(/^./, c => c.toUpperCase())}
            />
          </View>
          <Note>
            Arrive 15 minutes before your session and report to reception with
            this ID.
          </Note>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {booking.priorityRequestId ? (
            <ActionButton
              label="View priority request"
              variant="secondary"
              onPress={() =>
                navigation.navigate('PriorityRequestStatus', {
                  requestId: booking.priorityRequestId!,
                })
              }
            />
          ) : booking.status === 'CONFIRMED' ? (
            <ActionButton
              label="Request priority queue"
              variant="secondary"
              disabled={busy}
              onPress={() =>
                navigation.navigate('RequestPriority', { bookingId: id })
              }
            />
          ) : null}
          {booking.status === 'CONFIRMED' ? (
            <ActionButton
              label={busy ? 'Cancelling…' : 'Cancel booking'}
              variant="danger"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  'Cancel this booking?',
                  'Your appointment will be cancelled and its slot released.',
                  [
                    { text: 'Keep booking', style: 'cancel' },
                    {
                      text: 'Cancel booking',
                      style: 'destructive',
                      onPress: cancel,
                    },
                  ],
                )
              }
            />
          ) : null}
        </>
      ) : null}
    </PatientPage>
  );
}
