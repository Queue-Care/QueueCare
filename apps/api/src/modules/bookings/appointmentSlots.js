import { HttpError } from '../../utils/HttpError.js';

export function calculateSlots(session) {
  const day = session.sessionDate instanceof Date
    ? session.sessionDate.toISOString().slice(0, 10) : '';
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const start = new Date(`${day}T${session.startTime}:00+05:30`).getTime();
  const end = new Date(`${day}T${session.endTime}:00+05:30`).getTime();
  if (!day || !time.test(session.startTime) || !time.test(session.endTime) ||
      !Number.isSafeInteger(session.capacity) || session.capacity < 1 ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      (end - start) < session.capacity)
    throw new HttpError(409, 'SLOT_CONFIGURATION_INVALID', 'This session has an invalid appointment schedule.');
  const intervalMs = (end - start) / session.capacity;
  return Array.from({ length: session.capacity }, (_, slotIndex) => ({
    slotIndex, queueType: (slotIndex + 1) % 6 === 0 ? 'PRIORITY' : 'NORMAL',
    assignedTime: new Date(start + Math.floor(slotIndex * intervalMs)),
    slotIntervalMinutes: intervalMs / 60000,
  }));
}

// Legacy records without a slot occupy deterministic virtual positions. Never
// move an existing assigned appointment, and never silently discard overflow.
export function availableSlots(session, bookings, acceptedBookingIds = new Set()) {
  const slots = calculateSlots(session), occupied = new Set();
  const active = bookings.filter(b => b.status !== 'CANCELLED');
  for (const b of active.filter(b => b.slotIndex !== undefined)) {
    const slot = slots[b.slotIndex];
    if (!slot || occupied.has(b.slotIndex) || slot.queueType !== b.queueType)
      throw new HttpError(409, 'SLOT_CONFLICT', 'Existing appointment slots require reception review.');
    occupied.add(b.slotIndex);
  }
  const legacy = active.filter(b => b.slotIndex === undefined).sort((a, b) =>
    (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
    a._id.toString().localeCompare(b._id.toString()));
  for (const b of legacy) {
    const type = acceptedBookingIds.has(b._id.toString()) ? 'PRIORITY' : 'NORMAL';
    const slot = slots.find(s => s.queueType === type && !occupied.has(s.slotIndex));
    if (!slot) throw new HttpError(409, 'SLOT_CONFLICT', 'Existing bookings exceed the new slot limits. Reception must review this session.');
    occupied.add(slot.slotIndex);
  }
  return slots.filter(s => !occupied.has(s.slotIndex));
}

export async function readAvailableSlots(db, session, options = {}) {
  const bookings = await db.collection('bookings').find({ sessionId: session._id, status: { $ne: 'CANCELLED' } }, options).toArray();
  const accepted = await db.collection('priorityRequests').find({
    bookingId: { $in: bookings.map(b => b._id) }, status: 'ACCEPTED',
  }, options).toArray();
  return availableSlots(session, bookings, new Set(accepted.map(r => r.bookingId.toString())));
}

export function slotFields(slot) {
  return { slotIndex: slot.slotIndex, assignedTime: slot.assignedTime, queueType: slot.queueType };
}

export const noPrioritySlots = 'Your priority request could not be accommodated because there are currently no priority slots available for this OPD session. Please contact the hospital/reception for further assistance.';
