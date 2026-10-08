import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { calculateSlots, availableSlots } from '../modules/bookings/appointmentSlots.js';
import { createBookingRepository, ensureBookingIndexes } from '../modules/bookings/bookingRepository.js';
import { createPatientPriorityRepository, ensurePatientPriorityIndexes } from '../modules/priority/patientPriorityRepository.js';
import { createPriorityRepository } from '../modules/priority/g_priorityRepository.js';
import { createCheckInRepository } from '../modules/bookings/k_checkInRepository.js';
import { compareQueueEntries } from '../modules/queue/k_queueService.js';
import { readHospitalSessions } from '../modules/hospitals/hospitalSessions.js';
import { createStaffSessionRepository } from '../modules/sessions/k_sessionRepository.js';

const configuration = (capacity = 12, startTime = '08:30', endTime = '09:30') => ({
  sessionDate: new Date('2099-01-01T00:00:00Z'), capacity, startTime, endTime,
});
test('dynamic grids reserve every sixth position within total capacity', () => {
  for (const [capacity, start, end, minutes] of [[12, '08:30', '09:30', 5], [20, '09:00', '11:00', 6], [10, '08:00', '09:00', 6]]) {
    const slots = calculateSlots(configuration(capacity, start, end));
    assert.equal(slots.length, capacity);
    assert.equal(slots[0].slotIntervalMinutes, minutes);
    assert.equal(slots.filter(s => s.queueType === 'PRIORITY').length, Math.floor(capacity / 6));
    assert.equal(slots[5].queueType, 'PRIORITY');
    assert.equal(slots[6].queueType, 'NORMAL');
    assert.equal(slots[1].assignedTime - slots[0].assignedTime, minutes * 60000);
  }
  const slots = calculateSlots(configuration());
  assert.equal(slots[5].assignedTime.toISOString(), '2099-01-01T03:25:00.000Z');
  assert.equal(slots[11].assignedTime.toISOString(), '2099-01-01T03:55:00.000Z');
});
test('fractional intervals are not rounded to whole minutes or hardcoded', () => {
  const slots = calculateSlots(configuration(7));
  assert.equal(slots[1].assignedTime - slots[0].assignedTime, Math.floor(3600000 / 7));
  assert.ok(slots[6].assignedTime < new Date('2099-01-01T04:00:00Z'));
  for (const invalid of [{ capacity: 0 }, { endTime: '08:00' }, { capacity: 1.5 }])
    assert.throws(() => calculateSlots({ ...configuration(), ...invalid }), { code: 'SLOT_CONFIGURATION_INVALID' });
});
test('cancellation frees the same slot type and conflicting records fail closed', () => {
  const bookings = [{ _id: new ObjectId(), slotIndex: 5, queueType: 'PRIORITY', status: 'CONFIRMED' }];
  assert.deepEqual(availableSlots(configuration(), bookings).filter(s => s.queueType === 'PRIORITY').map(s => s.slotIndex), [11]);
  bookings[0].status = 'CANCELLED';
  assert.deepEqual(availableSlots(configuration(), bookings).filter(s => s.queueType === 'PRIORITY').map(s => s.slotIndex), [5, 11]);
  assert.throws(() => availableSlots(configuration(), [{ ...bookings[0], status: 'CONFIRMED', queueType: 'NORMAL' }]), { code: 'SLOT_CONFLICT' });
});
test('scheduled normal and priority appointments interleave; emergency still leads', () => {
  const entries = calculateSlots(configuration()).map(s => ({ ...s, priorityLevel: s.queueType === 'PRIORITY' ? 'APPROVED_PRIORITY' : 'NORMAL', queueNumber: s.slotIndex + 1 }));
  assert.deepEqual([...entries].reverse().sort(compareQueueEntries).map(e => e.slotIndex), Array.from({ length: 12 }, (_, i) => i));
  entries[10].priorityLevel = 'EMERGENCY';
  assert.equal(entries.sort(compareQueueEntries)[0].slotIndex, 10);
});

test('real transactions allocate, approve, reject, cancel and serialize slots per session', { skip: !process.env.TEST_MONGODB_URI }, async t => {
  const client = new MongoClient(process.env.TEST_MONGODB_URI);
  await client.connect();
  const db = client.db(`qcs_${randomUUID().replaceAll('-', '')}`);
  t.after(async () => { try { await db.dropDatabase(); } finally { await client.close(); } });
  await ensureBookingIndexes(db);
  await ensurePatientPriorityIndexes(db);
  const hospitalId = new ObjectId(), serviceId = new ObjectId(), staffId = new ObjectId(), sessionId = new ObjectId();
  let clock = new Date('2098-12-31T00:00:00Z');
  const now = () => clock;
  await db.collection('hospitals').insertOne({ _id: hospitalId, name: 'Test Hospital', address: 'Test address', city: 'Colombo', isActive: true });
  await db.collection('opdServices').insertOne({ _id: serviceId, hospitalId, name: 'Test OPD', isActive: true });
  await db.collection('users').insertOne({ _id: staffId, hospitalId, role: 'RECEPTION', status: 'ACTIVE' });
  await db.collection('opdSessions').insertOne({ _id: sessionId, hospitalId, serviceId, ...configuration(), doctorOrTeam: 'Doctor A', status: 'OPEN', bookedCount: 0 });
  const bookingRepo = createBookingRepository(db, client, { now });
  const patientPriority = createPatientPriorityRepository(db, { now });
  const staffPriority = createPriorityRepository(db, { now });
  async function patient() {
    const _id = new ObjectId();
    await db.collection('users').insertOne({ _id, role: 'PATIENT', status: 'ACTIVE', fullName: 'Test Patient' });
    return _id;
  }
  const patients = await Promise.all(Array.from({ length: 11 }, patient));
  // Separate patient writes still race on the same session document.
  const bookings = [];
  for (const p of patients.slice(0, 8)) bookings.push(await bookingRepo.create(p, sessionId));
  const results = await Promise.allSettled(patients.slice(8).map(p => bookingRepo.create(p, sessionId)));
  bookings.push(...results.filter(r => r.status === 'fulfilled').map(r => r.value));
  assert.equal(bookings.length, 10);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'SESSION_FULL').length, 1);
  assert.deepEqual(bookings.map(b => b.slotIndex).sort((a,b) => a-b), [0,1,2,3,4,6,7,8,9,10]);
  assert.equal(new Set(bookings.map(b => b.assignedTime)).size, 10);
  const details = await bookingRepo.getDetails(new ObjectId(bookings[0].patientId), new ObjectId(bookings[0]._id));
  assert.equal(details.assignedTime, bookings[0].assignedTime);
  assert.equal(details.queueType, 'NORMAL');
  const available = await readHospitalSessions(db, hospitalId, { date: '2099-01-01' }, clock);
  assert.equal(available.data[0].normalRemainingCapacity, 0);
  assert.equal(available.data[0].isBookable, false);
  await assert.rejects(createStaffSessionRepository(db, { now }).edit(staffId, sessionId, { capacity: 13 }), { code: 'SESSION_HAS_ASSIGNED_SLOTS' });
  const requests = await Promise.all(bookings.slice(0,3).map(b => patientPriority.create(new ObjectId(b.patientId), { bookingId: new ObjectId(b._id), reason: 'MOBILITY' })));
  assert.ok(requests.every(r => r.status === 'PENDING'));
  const decisions = await Promise.all(requests.map(r => staffPriority.decide(staffId, new ObjectId(r._id), { decision: 'ACCEPTED' })));
  assert.equal(decisions.filter(r => r.status === 'ACCEPTED').length, 2);
  const declined = decisions.find(r => r.status === 'DECLINED');
  assert.match(declined.decisionNote, /no priority slots/i);
  const acceptedBookings = await db.collection('bookings').find({ sessionId, queueType: 'PRIORITY' }).toArray();
  assert.deepEqual(acceptedBookings.map(b => b.slotIndex).sort((a,b)=>a-b), [5,11]);
  const notices = await db.collection('notifications').find({ type: 'PRIORITY', userId: { $ne: staffId } }).toArray();
  assert.equal(notices.length, 3);
  assert.equal(notices.filter(n => n.data.assignedTime instanceof Date).length, 2);
  const unavailable = await patientPriority.create(new ObjectId(bookings[3].patientId), { bookingId: new ObjectId(bookings[3]._id), reason: 'OTHER' });
  assert.equal(unavailable.status, 'DECLINED');
  assert.equal(unavailable.decisionCode, 'NO_PRIORITY_SLOT_AVAILABLE');
  const cancelled = acceptedBookings[0];
  await bookingRepo.cancel(cancelled.patientId, cancelled._id);
  await bookingRepo.cancel(cancelled.patientId, cancelled._id);
  const retry = await patientPriority.create(new ObjectId(bookings[3].patientId), { bookingId: new ObjectId(bookings[3]._id), reason: 'OTHER' });
  const accepted = await staffPriority.decide(staffId, new ObjectId(retry._id), { decision: 'ACCEPTED' });
  assert.equal(accepted.status, 'ACCEPTED');
  const reassigned = await db.collection('bookings').findOne({ _id: new ObjectId(bookings[3]._id) });
  assert.equal(reassigned.slotIndex, cancelled.slotIndex);
  // A normal cancellation releases only its normal slot; replays release once.
  const normal = bookings[4];
  await bookingRepo.cancel(new ObjectId(normal.patientId), new ObjectId(normal._id));
  const refill = await bookingRepo.create(await patient(), sessionId);
  assert.equal(refill.queueType, 'NORMAL');
  assert.notEqual(refill.slotIndex % 6, 5);
  const otherSession = new ObjectId();
  await db.collection('opdSessions').insertOne({ _id: otherSession, hospitalId, serviceId, ...configuration(10, '09:00', '11:00'), doctorOrTeam: 'Doctor B', status: 'OPEN', bookedCount: 0 });
  const other = await bookingRepo.create(await patient(), otherSession);
  assert.equal(other.slotIndex, 0);
  assert.equal(other.assignedTime, '2099-01-01T03:30:00.000Z');
  const another = await bookingRepo.create(await patient(), otherSession);
  const doubleRequest = await patientPriority.create(new ObjectId(another.patientId), { bookingId: new ObjectId(another._id), reason: 'OTHER' });
  const repeated = await Promise.allSettled([1,2].map(() => staffPriority.decide(staffId, new ObjectId(doubleRequest._id), { decision: 'ACCEPTED' })));
  assert.equal(repeated.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(repeated.filter(r => r.status === 'rejected' && r.reason.code === 'PRIORITY_REQUEST_ALREADY_DECIDED').length, 1);
  // Check-in carries the assigned schedule rather than allocating another slot.
  clock = new Date('2099-01-01T02:00:00Z');
  const entry = await createCheckInRepository(db, { now }).checkIn(staffId, reassigned._id);
  assert.equal(entry.assignedTime, reassigned.assignedTime.toISOString());
  assert.equal(entry.queueType, 'PRIORITY');
  await assert.rejects(staffPriority.decide(staffId, new ObjectId(retry._id), { decision: 'ACCEPTED' }), { code: 'PRIORITY_REQUEST_ALREADY_DECIDED' });
});
