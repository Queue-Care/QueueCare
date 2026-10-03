import { session } from './sessionFixtures';
export const patientId = 'abcdef000000000000000001';
export const bookingPayload = {
  success: true,
  data: {
    _id: 'abcdef000000000000000401',
    bookingCode: 'OPD-74A099F60D3B48C18409D3A835176FA0',
    patientId,
    sessionId: session._id,
    status: 'CONFIRMED',
    createdAt: '2026-10-03T02:00:00.000Z',
    updatedAt: '2026-10-03T02:00:00.000Z',
  },
};
