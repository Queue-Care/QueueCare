import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingsStackParams } from '../navigation/types';
import {
  Field,
  LoadState,
  PatientPage,
  patientStyles as s,
} from '../components/PatientPage';
import { ActionButton } from '../components/ActionButton';
import {
  formatVisit,
  message,
  parseBooking,
  parsePriority,
  patientApi,
  PatientApiError,
  reasons,
  type PriorityRequest,
} from '../features/patient/api';
import { usePatientResource } from '../features/patient/usePatientResource';
import { colors } from '../theme/tokens';

export function RequestPriorityScreen({
  route,
  navigation,
  accessToken,
}: NativeStackScreenProps<BookingsStackParams, 'RequestPriority'> & {
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
  const [reason, setReason] = useState<PriorityRequest['reason']>('ELDERLY');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit() {
    if (busy || state.data?.status !== 'CONFIRMED') return;
    setBusy(true);
    setError(undefined);
    try {
      const request = parsePriority(
        await patientApi(
          `/bookings/${encodeURIComponent(id)}/priority-requests`,
          {
            token: accessToken,
            method: 'POST',
            body: { reason, note: note.trim() },
          },
        ),
      );
      if (request.bookingId !== id)
        throw new PatientApiError(
          'We could not read your request. Please refresh your booking.',
        );
      navigation.replace('PriorityRequestStatus', { requestId: request._id });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <PatientPage>
      <Text style={s.text}>
        Ask reception to move you ahead in the queue if you need assistance.
      </Text>
      <LoadState
        loading={state.loading}
        error={state.error}
        retry={state.reload}
      />
      {state.data ? (
        <>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.heading}>{state.data.serviceName}</Text>
              <Text style={s.badge}>
                {state.data.status === 'CONFIRMED'
                  ? 'Confirmed'
                  : state.data.status}
              </Text>
            </View>
            <Text style={s.small}>{formatVisit(state.data.startsAt)}</Text>
          </View>
          {state.data.status === 'CONFIRMED' &&
          !state.data.priorityRequestId ? (
            <>
              <Text style={s.heading}>Reason for the request</Text>
              <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
                {(Object.keys(reasons) as PriorityRequest['reason'][]).map(
                  value => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityLabel={reasons[value]}
                      accessibilityState={{
                        checked: reason === value,
                        disabled: busy,
                      }}
                      disabled={busy}
                      onPress={() => setReason(value)}
                      style={[
                        s.card,
                        s.row,
                        reason === value && {
                          borderColor: colors.teal,
                          backgroundColor: colors.tealTint,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>{reasons[value]}</Text>
                        {value === 'ELDERLY' || value === 'MOBILITY' ? (
                          <Text style={s.small}>
                            {value === 'ELDERLY'
                              ? '65 years or older'
                              : 'Wheelchair or walking support'}
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          borderWidth: 2,
                          borderColor:
                            reason === value ? colors.teal : colors.sage,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {reason === value ? (
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: colors.teal,
                            }}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  ),
                )}
              </View>
              <Field
                label="Anything reception should know?"
                placeholder="Optional"
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={500}
                editable={!busy}
              />
              {error ? (
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
              ) : null}
              <View style={{ flex: 1 }} />
              <ActionButton
                label={busy ? 'Submitting…' : 'Submit request'}
                variant="urgent"
                onPress={submit}
                disabled={busy}
              />
            </>
          ) : (
            <>
              <Text style={s.text}>
                {state.data.priorityRequestId
                  ? 'You already have a priority request for this appointment.'
                  : 'Priority requests are available for confirmed appointments.'}
              </Text>
              <ActionButton
                label="Back to booking"
                variant="outline"
                onPress={() =>
                  navigation.navigate('BookingDetails', { bookingId: id })
                }
              />
            </>
          )}
        </>
      ) : null}
    </PatientPage>
  );
}
