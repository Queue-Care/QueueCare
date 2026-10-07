import { HttpError } from '../../utils/HttpError.js';

// README M3-14: documented approximate server default, not a guaranteed wait.
export const AVERAGE_CONSULTATION_MINUTES = 10;
const ranks = { EMERGENCY: 0, APPROVED_PRIORITY: 1, NORMAL: 2 };
export function compareQueueEntries(a, b) {
  return ranks[a.priorityLevel] - ranks[b.priorityLevel] || a.queueNumber - b.queueNumber ||
    a.checkedInAt.getTime() - b.checkedInAt.getTime() || a._id.toString().localeCompare(b._id.toString());
}

export function assertQueueIntegrity(entries) {
  const bookings = new Set(), numbers = new Set();
  for (const entry of entries) {
    const bookingId = entry.bookingId.toString();
    if (bookings.has(bookingId) || numbers.has(entry.queueNumber))
      throw new HttpError(409, 'QUEUE_CONFLICT', 'Stored queue records are inconsistent.');
    bookings.add(bookingId); numbers.add(entry.queueNumber);
  }
}

// Repository supplies validated active entries. Keep this calculation reusable
// for a future patient read without introducing another ordering authority.
export function buildQueueSnapshot(sessionId, entries) {
  assertQueueIntegrity(entries);
  const waiting = entries.filter(entry => entry.status === 'WAITING').sort(compareQueueEntries);
  const serving = entries.filter(entry => entry.status !== 'WAITING').sort(compareQueueEntries);
  const item = (entry, index = null) => ({ queueEntryId: entry._id.toString(), bookingId: entry.bookingId.toString(),
    patientId: entry.patientId.toString(), fullName: entry.fullName.trim(), queueNumber: entry.queueNumber,
    priorityLevel: entry.priorityLevel, status: entry.status, checkedInAt: entry.checkedInAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(), position: index === null ? null : index + 1,
    patientsAhead: index, estimatedWaitMinutes: index === null ? null : index * AVERAGE_CONSULTATION_MINUTES });
  return { sessionId: sessionId.toString(), averageConsultationMinutes: AVERAGE_CONSULTATION_MINUTES,
    queue: [...waiting.map((entry, index) => item(entry, index)), ...serving.map(entry => item(entry))] };
}
