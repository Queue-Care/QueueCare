export type NextAppointment = {
  bookingId: string;
  bookingCode: string;
  hospitalName: string;
  serviceName: string;
  startsAt: string;
};

export class AppointmentLoadError extends Error {
  constructor(
    public readonly kind:
      | 'configuration'
      | 'authentication'
      | 'network'
      | 'response',
  ) {
    super('Unable to load the next appointment');
    this.name = 'AppointmentLoadError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Joined booking summary contract documented in docs/API.md.
export function parseNextAppointment(payload: unknown): NextAppointment | null {
  if (
    !record(payload) ||
    payload.success !== true ||
    !Array.isArray(payload.data) ||
    payload.data.length > 1
  ) {
    throw new AppointmentLoadError('response');
  }
  if (payload.data.length === 0) return null;
  const booking: unknown = payload.data[0];
  if (
    !record(booking) ||
    booking.status !== 'CONFIRMED' ||
    !text(booking._id) ||
    !text(booking.bookingCode) ||
    !text(booking.hospitalName) ||
    !text(booking.serviceName) ||
    !text(booking.startsAt) ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(booking.startsAt) ||
    !Number.isFinite(Date.parse(booking.startsAt))
  ) {
    throw new AppointmentLoadError('response');
  }
  return {
    bookingId: booking._id,
    bookingCode: booking.bookingCode,
    hospitalName: booking.hospitalName,
    serviceName: booking.serviceName,
    startsAt: booking.startsAt,
  };
}

export async function getNextAppointment(
  accessToken: string | undefined,
  signal: AbortSignal,
): Promise<NextAppointment | null> {
  if (!accessToken?.trim()) throw new AppointmentLoadError('authentication');
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(
    /\/+$/,
    '',
  );
  if (!baseUrl || !/^https?:\/\//.test(baseUrl))
    throw new AppointmentLoadError('configuration');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal.aborted) cancel();
  signal.addEventListener('abort', cancel);
  const timeout = setTimeout(cancel, 15000);
  try {
    const response = await fetch(
      `${baseUrl}/bookings/me?status=upcoming&limit=1`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      },
    );
    if (response.status === 401 || response.status === 403)
      throw new AppointmentLoadError('authentication');
    if (!response.ok) throw new AppointmentLoadError('network');
    return parseNextAppointment(await response.json());
  } catch (error) {
    if (error instanceof AppointmentLoadError) throw error;
    throw new AppointmentLoadError('network');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
