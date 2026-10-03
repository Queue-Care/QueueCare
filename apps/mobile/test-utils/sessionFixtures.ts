// Explicit test data; never imported by the application.
export const hospitalId = 'abcdef000000000000000101';
export const serviceId = 'abcdef000000000000000201';
export const date = '2026-10-03';
export const session = {
  _id: 'abcdef000000000000000301',
  hospitalId,
  serviceId,
  serviceName: 'General OPD',
  doctorOrTeam: 'Test team',
  sessionDate: date,
  startTime: '09:00',
  endTime: '10:00',
  startsAt: `${date}T03:30:00.000Z`,
  endsAt: `${date}T04:30:00.000Z`,
  status: 'OPEN',
  capacity: 20,
  bookedCount: 8,
  remainingCapacity: 12,
  isBookable: true,
};
export function envelope(data = [session]) {
  return {
    success: true,
    data,
    meta: {
      date,
      timeZone: 'Asia/Colombo',
      total: data.length,
      bookableCount: data.filter(item => item.isBookable).length,
    },
  };
}
export const hospital = {
  id: hospitalId,
  name: 'Test Hospital',
  address: 'Test address',
  city: 'Colombo',
};
