# Appointment slots and priority allocation

Reception review remains required. A submitted request is `PENDING` while a
future reserved slot exists. Submission does not reserve that slot. If none
exists, submission saves `DECLINED` with `decisionCode:
NO_PRIORITY_SLOT_AVAILABLE`, a patient-facing reason, and an in-app notification.

Pending submission also sends `PRIORITY_REQUEST_SUBMITTED` notifications only to
ACTIVE RECEPTION/NURSE/ADMIN users whose hospitalId matches the booked session.
Notifications are addressed to individual staff user IDs using the existing
notification collection. Other hospitals, unlinked staff and suspended staff
receive none. Staff priority list/count/detail/decision endpoints require a
valid hospital link; missing links return 403 rather than exposing all requests.

## Calculation

The session's existing capacity is the **total** number of positions, including
priority positions. Interval = (end instant − start instant) / capacity.
Instants use the session date and Asia/Colombo time. Position `i`, zero-based,
starts at `start + floor(i × intervalMilliseconds)`. Fractional minute intervals
are retained, to millisecond precision. No interval is hardcoded.

Positions 6, 12, 18, … are priority-only. Others are normal-only. For 08:30–09:30
and capacity 12, the interval is 5 minutes: normal appointments use 08:30,
08:35, 08:40, 08:45, 08:50, 09:00, 09:05, 09:10, 09:15, 09:20. Reserved priority
appointments are 08:55 and 09:25. Normal capacity is 10, not 12.

Normal booking chooses the earliest unoccupied normal position. Reception
acceptance chooses the earliest unoccupied **future** priority position, replaces
that patient's normal assignment, and makes the former normal position available.
Other appointments retain their times. No reserved position is released to normal
booking. Every calculation is scoped to one session ID.

If another reviewer filled the last priority slot while a request was pending,
acceptance instead commits `DECLINED`, the reason and a notification. It never
reports `ACCEPTED` without an actual slot. A patient who has already been called
or started consultation cannot be reassigned. Normal manual decline remains supported.

## Existing endpoints changed (no new endpoints)

| Endpoint | Change |
| --- | --- |
| `POST /api/v1/bookings` | Allocates a normal position; returns assignedTime, queueType, slotIndex. Normal exhaustion returns SESSION_FULL. |
| `GET /api/v1/bookings/:id`, `GET /api/v1/bookings/me` | Include assignedTime and queueType when present. |
| `PATCH /api/v1/bookings/:id/cancel` | Existing transaction releases capacity; CANCELLED bookings no longer occupy their assigned position. Cancellation replay still releases once; existing check-in/start restrictions remain. |
| `GET /api/v1/hospitals/:id/sessions` | Adds normalRemainingCapacity; isBookable reflects normal availability. remainingCapacity still reports total physical capacity. |
| `POST /api/v1/bookings/:id/priority-requests` | Checks reserved availability and stores PENDING or DECLINED plus reason/notification. |
| `GET /api/v1/priority-requests/me` | Includes decisionCode for slot exhaustion. |
| `PATCH /api/v1/staff/priority-requests/:id/decision` | Decision, slot replacement, waiting queue update, notification and audit are one transaction. |
| Staff priority list/detail | Booking summary includes assignedTime and queueType. |
| Staff check-in and queue reads/mutations | Carry assignedTime and queueType. Scheduled normal and priority entries interleave by assigned time; EMERGENCY retains precedence. Queue estimates use the configured session interval. |
| Staff session editing | Date, times and capacity cannot change once noncancelled appointments have assigned times; this prevents silently changing their slot grid. Other edits remain available. |

## Data and concurrency

No collections, identity fields, authentication flows, or notification
architecture were added. Existing bookings gain `slotIndex` (zero-based integer),
`assignedTime` (BSON Date) and `queueType` (`NORMAL` / `PRIORITY`). Check-in copies
these onto the existing queue entry. Requests can gain `decisionCode` and use
the existing `DECLINED` status instead of introducing a new status enum.

The partial unique index `booking_active_slot_unique` on `(sessionId, slotIndex)`
applies to assigned CONFIRMED/COMPLETED/SKIPPED/RESCHEDULED bookings. CANCELLED
records retain history without occupying a position. Existing duplicate-patient
and duplicate-booking-code constraints remain.

MongoDB snapshot transactions, majority commits and real writes to the shared
session/booking documents serialize allocation against other bookings, priority
decisions, check-in, cancellation and session edits. Conflicting transactions
retry from fresh reads. A PENDING status filter also prevents double decisions.
Notifications and audit entries roll back if allocation/decision fails.
Private `slotRevision` increments provide conflict points; they are not API fields.

Legacy bookings without assigned times consume deterministic virtual normal
positions (or priority positions for existing accepted requests) during allocation.
They are not silently rewritten or moved. If the old data cannot fit the new
reserved limits, allocation fails closed with SLOT_CONFLICT and normal discovery
is not bookable. Reception must review that session; no automatic database
migration or destructive cleanup is performed. Legacy queue-only records retain
their previous estimate/order fallback when no schedule is available.

## Files

Backend changes are limited to:

- `apps/api/src/modules/bookings/appointmentSlots.js` (new shared calculator/availability)
- `apps/api/src/modules/bookings/bookingRepository.js`, `bookingDetails.js`, `bookingNotification.js`, `k_checkInRepository.js`
- `apps/api/src/modules/hospitals/hospitalSessions.js`
- `apps/api/src/modules/priority/patientPriorityRepository.js`, `g_priorityRepository.js`
- `apps/api/src/modules/queue/k_queueService.js`, `k_queueRead.js`, `k_queueRepository.js`, `k_queueMutationRepository.js`
- `apps/api/src/modules/sessions/k_sessionRepository.js`

Mobile changes only parse availability/assigned fields and show appointment time,
queue type and the no-slot status using the existing layout:

- `apps/mobile/src/features/booking/availableSessions.ts`, `bookingDetails.ts`
- `apps/mobile/src/features/patient/api.ts`
- `apps/mobile/src/features/priority/g_priorityRequests.ts`
- `apps/mobile/src/screens/BookAppointmentScreen.tsx`, `BookingConfirmationScreen.tsx`, `BookingDetailsScreen.tsx`, `PriorityRequestDetailsScreen.tsx`, `RequestStatusScreen.tsx`

Tests: `apps/api/src/tests/appointmentSlots.test.js` (new),
`apps/api/src/tests/patientPriority.test.js` (realistic capacity fixture),
`apps/mobile/__tests__/BookingDetailsApi.test.ts`, `BookingConfirmation.test.tsx`.

## Verification

`appointmentSlots.test.js` covers 60/12, 120/20, 60/10, fractional intervals,
normal exhaustion, concurrent normal allocation, concurrent reserved approvals,
no-slot denial on both submission and acceptance, notification contents,
normal/priority cancellation and reuse, separate doctors/sessions, duplicate
reviewers, assigned detail responses, check-in, and frozen session grids.

Unit tests run without MongoDB:

```powershell
node --test --test-isolation=none apps/api/src/tests/appointmentSlots.test.js
```

Set `TEST_MONGODB_URI` to a transaction-capable test server to run integration
coverage. The suite creates a uniquely named `qcs_...` database and drops only
that database on cleanup. It never uses or edits `queuecare` or real accounts.

```powershell
npm run typecheck:mobile
npm run test:mobile -- --watchman=false BookAppointment.test.tsx BookingConfirmation.test.tsx BookingDetailsApi.test.ts PatientPages.test.tsx AvailableSessionsApi.test.ts
```

Validation: 8 backend tests including isolated real MongoDB transactions and 90
focused mobile tests passed. The existing staff priority acceptance screen test also passed. Three pre-existing failures in
`g_StaffMember4.test.tsx` (dashboard fetch, notifications navigation and token
expiry) were also observed; these existed before this change and are outside
the slot-allocation scope. Other MongoDB integration suites that require local
`mongod` were not run here.
