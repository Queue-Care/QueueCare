import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingsStackParams } from '../navigation/types';
import {
  DetailRow,
  LoadState,
  PatientPage,
  patientStyles as s,
} from '../components/PatientPage';
import { ActionButton } from '../components/ActionButton';
import {
  formatVisit,
  parseBooking,
  parsePriority,
  patientApi,
  PatientApiError,
  reasons,
} from '../features/patient/api';
import { usePatientResource } from '../features/patient/usePatientResource';
import { colors, radii } from '../theme/tokens';

export function RequestStatusScreen({
  route,
  navigation,
  accessToken,
}: NativeStackScreenProps<BookingsStackParams, 'PriorityRequestStatus'> & {
  accessToken?: string;
}) {
  const id = route.params.requestId;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const data = await patientApi('/priority-requests/me', {
        token: accessToken,
        signal,
      });
      if (!Array.isArray(data))
        throw new PatientApiError('We could not read your requests.');
      const request = data.map(parsePriority).find(item => item._id === id);
      if (!request)
        throw new PatientApiError('This request could not be found.');
      const booking = parseBooking(
        await patientApi(`/bookings/${encodeURIComponent(request.bookingId)}`, {
          token: accessToken,
          signal,
        }),
      );
      if (booking._id !== request.bookingId)
        throw new PatientApiError(
          'We could not find the appointment for this request.',
        );
      return { request, booking };
    },
    [id, accessToken],
  );
  const state = usePatientResource(load);
  const data = state.data;
  const pending = data?.request.status === 'PENDING';
  const accepted = data?.request.status === 'ACCEPTED';
  return (
    <PatientPage>
      <LoadState
        loading={state.loading}
        error={state.error}
        retry={state.reload}
      />
      {data ? (
        <>
          <View
            style={[
              s.card,
              {
                alignItems: 'center',
                backgroundColor: pending
                  ? colors.amberTint
                  : accepted
                  ? colors.tealTint
                  : colors.coralTint,
                borderColor: pending
                  ? colors.amber
                  : accepted
                  ? colors.teal
                  : colors.coral,
              },
            ]}
          >
            <Text style={s.label}>Current status</Text>
            <Text style={s.title}>
              {pending ? 'Under review' : accepted ? 'Accepted' : 'Declined'}
            </Text>
            <Text style={[s.small, { textAlign: 'center' }]}>
              Submitted {formatVisit(data.request.createdAt)}
            </Text>
          </View>
          <View style={{ gap: 0, paddingHorizontal: 8 }}>
            {[
              ['Request submitted', formatVisit(data.request.createdAt), true],
              [
                pending
                  ? 'Reception is reviewing'
                  : 'Reception reviewed your request',
                'Usually answered within 2 hours during opening times.',
                true,
              ],
              [
                'Decision',
                pending
                  ? 'You will be notified either way.'
                  : accepted
                  ? 'Priority assistance has been approved.'
                  : 'Your regular appointment remains booked.',
                !pending,
              ],
            ].map(([title, description, complete], index) => (
              <View
                key={String(title)}
                style={{ flexDirection: 'row', gap: 16 }}
              >
                <View style={{ alignItems: 'center', width: 24 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: radii.circle,
                      backgroundColor: complete
                        ? pending && index === 1
                          ? colors.amber
                          : colors.teal
                        : colors.sageLine,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.panel }}>
                      {complete && !(pending && index === 1) ? '✓' : '·'}
                    </Text>
                  </View>
                  {index < 2 ? (
                    <View
                      style={{
                        width: 2,
                        flex: 1,
                        backgroundColor: colors.sageLine,
                      }}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 26, gap: 6 }}>
                  <Text style={s.label}>{title}</Text>
                  <Text style={s.small}>{description}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={s.card}>
            <DetailRow
              label="Reason given"
              value={reasons[data.request.reason]}
            />
            <DetailRow
              label="Appointment"
              value={`${data.booking.serviceName} · ${formatVisit(
                data.booking.startsAt,
              )}`}
            />
            {data.request.note ? (
              <DetailRow label="Your note" value={data.request.note} />
            ) : null}
            {data.request.decisionNote ? (
              <DetailRow
                label="Reception note"
                value={data.request.decisionNote}
              />
            ) : null}
          </View>
          <View style={{ flex: 1 }} />
          <ActionButton
            label="Refresh status"
            variant="secondary"
            onPress={state.reload}
          />
          <ActionButton
            label="Back to booking"
            variant="outline"
            onPress={() =>
              navigation.navigate('BookingDetails', {
                bookingId: data.request.bookingId,
              })
            }
          />
        </>
      ) : null}
    </PatientPage>
  );
}
