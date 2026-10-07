import { session, hospital, serviceId } from './sessionFixtures';
export const patientId = 'abcdef000000000000000001';
export const bookingPayload = {
  success: true,
  data: {
    _id: 'abcdef000000000000000401',
    bookingCode: 'OPD-7K3QX9',
    patientId,
    sessionId: session._id,
    status: 'CONFIRMED',
    createdAt: '2026-10-03T02:00:00.000Z',
    updatedAt: '2026-10-03T02:00:00.000Z',
  },
};
export const bookingDetailsPayload = {
  success: true,
  data: {
    ...bookingPayload.data,
    hospital: {
      _id: hospital.id,
      name: hospital.name,
      address: hospital.address,
      city: hospital.city,
      isActive: true,
    },
    service: { _id: serviceId, name: 'General OPD', isActive: true },
    session,
  },
};
