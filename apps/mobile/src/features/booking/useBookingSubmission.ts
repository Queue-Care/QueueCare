import { useEffect, useRef, useState } from 'react';
import {
  createBooking,
  CreateBookingError,
  isBookingId,
  type BookingErrorKind,
  type CreatedBooking,
} from './createBooking';
export type BookingOutcome =
  | { status: 'pending' }
  | { status: 'success'; booking: CreatedBooking }
  | { status: 'error'; kind: BookingErrorKind };
export type BookingSubmission = ReturnType<typeof useBookingSubmission>;

// Lives above the booking screen so navigating away doesn't forget a pending/uncertain POST.
export function useBookingSubmission(patientId?: string, accessToken?: string) {
  const [outcomes, setOutcomes] = useState<Record<string, BookingOutcome>>({});
  const [lastAttempt, setLastAttempt] = useState<{
    sessionId: string;
    label: string;
  }>();
  const [rejectedToken, setRejectedToken] = useState<string>();
  const active = useRef<{
    controller: AbortController;
    sessionId: string;
  } | null>(null);
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      const pending = active.current;
      active.current = null;
      pending?.controller.abort();
      if (pending)
        setOutcomes(previous => ({
          ...previous,
          [pending.sessionId]: { status: 'error', kind: 'uncertain' },
        }));
    };
  }, [patientId, accessToken]);
  const authenticated =
    isBookingId(patientId) &&
    !!accessToken?.trim() &&
    !/\s/.test(accessToken) &&
    rejectedToken !== accessToken;
  const pending = Object.values(outcomes).some(
    outcome => outcome.status === 'pending',
  );
  const submit = async (
    sessionId: string,
    label: string,
  ): Promise<CreatedBooking | undefined> => {
    if (
      !live.current ||
      active.current ||
      !authenticated ||
      !patientId ||
      !accessToken
    )
      return;
    const known = outcomes[sessionId];
    if (known?.status === 'success') return known.booking;
    if (known?.status === 'error' && known.kind === 'duplicate') return;
    const controller = new AbortController();
    active.current = { controller, sessionId };
    setLastAttempt({ sessionId, label });
    setOutcomes(previous => ({
      ...previous,
      [sessionId]: { status: 'pending' },
    }));
    try {
      const booking = await createBooking({
        patientId,
        accessToken,
        sessionId,
        signal: controller.signal,
      });
      if (!live.current || active.current?.controller !== controller) return;
      setOutcomes(previous => ({
        ...previous,
        [sessionId]: { status: 'success', booking },
      }));
      return booking;
    } catch (error) {
      if (!live.current || active.current?.controller !== controller) return;
      const kind =
        error instanceof CreateBookingError ? error.kind : 'uncertain';
      if (kind === 'authentication' || kind === 'forbidden')
        setRejectedToken(accessToken);
      setOutcomes(previous => ({
        ...previous,
        [sessionId]: { status: 'error', kind },
      }));
    } finally {
      if (active.current?.controller === controller) active.current = null;
    }
  };
  return { outcomes, pending, authenticated, lastAttempt, submit };
}
