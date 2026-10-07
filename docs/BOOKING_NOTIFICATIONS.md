# Booking-confirmed notifications — M1-13 / I-03 integration

Member 1's creation step is implemented: a successful booking stores one unread in-app notification in MongoDB. M1-12 and M1-13 are merged through PR #19. M1-14’s [accessibility refinements](ACCESSIBILITY.md) are implemented. M1-15’s [test coverage and evidence](TESTING.md) are complete. M1-16’s [Home search clarification](PATIENT_HOME.md) is implemented. M1-17’s [session-action refinement](HOSPITAL_DETAILS.md#m1-17-session-action-refinement) is implemented. Next is patient-flow integration and phone acceptance (I-01 / T-04).

As of 2026-10-06, the branch includes Member 4's owner-scoped notification list/read/read-all/delete APIs and live Alerts/Profile screens. The I-01 booking-read integration is merged through PR #28. This follow-up connects booking-confirmed alerts to patient Booking Details and verifies the producer/consumer flow. I-03's automated API integration is covered; physical Expo Go acceptance remains pending. Only the booking-confirmed part of I-09 notification navigation is implemented here; other notification destinations remain with their owners.

## Creation and failure behavior

`POST /api/v1/bookings` verifies the current active patient, validates the session, increments capacity, inserts the booking, then inserts its notification using the same MongoDB session/transaction. HTTP 201 is returned after commit. The existing response shape is unchanged.

The notification is part of the transaction, so no committed booking from this producer is missing its confirmation notification. A notification storage failure aborts the booking, capacity increment, notification, and eligibility revision writes; the API returns a generic 500. Client recovery remains conservative because a lost commit/HTTP response can still mean success. A deliberate retry after a successful commit returns `BOOKING_ALREADY_EXISTS`, creates no extra notification, and does not reset `readAt`.

Only MongoDB operations run inside the retried callback. A transient transaction failure can rerun the callback; inserts from aborted attempts are rolled back. No external notification delivery occurs. This follows the driver's [transaction/session and retry requirements](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

## Record contract for Member 4

| Field | Stored value |
| --- | --- |
| `_id` | Notification ObjectId, independent of the booking ID |
| `userId` | Booking patient's ObjectId, derived from verified authentication |
| `type` | `BOOKING` |
| `title` | `Booking confirmed` |
| `message` | `Your booking <saved bookingCode> is confirmed. Open your booking for appointment details.` |
| `data.event` | `BOOKING_CONFIRMED` |
| `data.bookingId` | Saved booking ObjectId |
| `data.sessionId` | OPD session ObjectId |
| `readAt` | `null` (unread) |
| `createdAt` | Same BSON Date as the booking's `createdAt` |

This event records that a booking was created; it is not the current appointment status. Open the owner-protected booking endpoint to show current status. No profile, NIC, JWT, unverified request text, arrival time, or reminder promise is stored in the notification. Later cancellation/session changes require their own events. Previously created bookings are not backfilled.

Startup creates `notification_booking_confirmed_unique` on `{ userId: 1, "data.bookingId": 1, "data.event": 1 }`. Its partial filter selects `type: "BOOKING"`, `data.event: "BOOKING_CONFIRMED"`, and ObjectId-valued `data.bookingId`. It enforces one confirmation per patient/booking while leaving other event types to their own policies. This follows MongoDB's [partial unique index semantics](https://www.mongodb.com/docs/manual/core/index-partial/). Index setup is repeatable, outside the transaction, and does not delete existing duplicates. An incompatible index or duplicate matching records requires resolution before startup can succeed.

Member 4 should consume these records rather than create a second confirmation after the booking route succeeds. Keep IDs as BSON ObjectIds in MongoDB; serialize them as strings in HTTP DTOs. List/read operations must scope by authenticated `userId`; `readAt: null` identifies these unread records. Authorize the destination booking again when opening it. The booking producer can later move into the shared service while preserving the same transaction, record contract, and duplicate policy.

## Check locally

Run from the repository root:

```bash
npm run test:api
```

All **61 API tests pass**. Tests use owned temporary databases and a local replica set, never `apps/api/.env` or the configured Atlas database. Coverage includes unread record shape/ownership, all booking rejection paths, concurrent capacity and duplicate requests, repeated requests after marking read, partial-index scope, rollback after notification insertion, and a forced transient retry after insertion. The retry test injects a labelled driver error while using real MongoDB transactions; it is not a network-failover test.

For a manual development check, follow [booking API setup](BOOKING_API.md), restart `npm run dev:api` to create the index, and create a booking through real patient authentication. In Compass, open the configured database's `notifications` collection and filter by the saved booking ID:

```javascript
{ type: "BOOKING", "data.event": "BOOKING_CONFIRMED", "data.bookingId": ObjectId("000000000000000000000401") }
```

Replace the example ID with the actual saved booking's `_id`, not its displayed `OPD-...` code. Verify exactly one record, correct `userId`, `readAt: null`, and a matching booking/session. Repeat the booking request and verify the notification count stays one. These manual checks and authenticated Expo Go acceptance remain pending; patient JWT sign-in is connected, but startup still signs out because persistent restoration is pending.

## Open a saved booking from Alerts — 2026-10-06

The notification adapter retains a navigation target only when `type` is `BOOKING`, `data.event` is `BOOKING_CONFIRMED`, and `data.bookingId` is a valid 24-character hexadecimal ID. Unknown/legacy/malformed metadata remains readable as an ordinary notification, without a booking link. No arbitrary URL or route name from the API is followed.

In patient Alerts, a recognised event shows **View booking** and a matching accessibility hint. Tapping it opens `Bookings → BookingDetails` with only the booking ID and marks an unread notification read in parallel. Already-read alerts still open the booking. The destination fetch uses the current token and the backend rechecks ownership; a missing or inaccessible booking shows the existing error state. Read-receipt failures do not block navigation and are reported; a late failure from an unmounted/replaced account cannot expire the new session or raise a stale alert. Staff screens without the patient booking callback retain their existing mark-as-read behavior.

### Verification

On 2026-10-06, **81 API tests and 277 mobile tests across 21 suites pass**, along with TypeScript, ESLint and Android/iOS Metro exports (`/private/tmp/queuecare-booking-alert-integration-export`). The merged dependencies were installed using `npm install --ignore-scripts --no-audit --no-fund`; package manifests and the lockfile are unchanged.

- API `bookingList.test.js`: real registration/login → transactional booking → notification list → saved booking → mark read. Verifies another patient sees no alert and cannot read its receipt or booking; a duplicate booking request leaves one notification and preserves its read timestamp. Uses an isolated temporary MongoDB replica set, never the configured database.
- Mobile `BookingNotifications.test.tsx`: real navigation with mocked transport covers unread/read alerts, token forwarding, malformed metadata, unavailable bookings, delayed/failed receipts and account replacement.
- Home's merged redesign had reintroduced the second search tile. It is removed while retaining the new styling; guest browsing guidance is restored. The five Home-state regressions now assert the accessible control and its position, rather than requiring the old ActionButton implementation.

### Expo Go checklist — pending

1. Start the configured API with `npm run dev:api`; in another root terminal run `npm run dev:mobile -- --clear`. Use the laptop's reachable `/api/v1` URL in `apps/mobile/.env`.
2. Sign in as a test patient and create one future-session booking. Record the confirmation code.
3. Open Alerts. The new Booking confirmed message should be unread and show View booking. Tap it; Booking Details must show the same saved code, hospital and service.
4. Return to Alerts and confirm the notification is read. Tap it again: it should still open the same booking. Reopening Alerts refetches persisted state.
5. Sign in as a second test patient and verify the first patient's notification and booking are absent. The current app keeps sessions in memory, so a restart requires sign-in.
6. Check slow/offline receipt recovery and an unavailable booking with controlled test data. Confirm error states do not display fabricated details. Check text scaling, touch targets and screen-reader hints.
7. Record device/OS, screenshots and observed outcomes in milestone evidence. No phone/participant result is inferred from automated tests.

The current notification API returns the latest 50 records; older-alert pagination is not added by this change. Cancellation and patient priority-request backend work, other notification destinations, persistent session restoration and full physical patient-flow acceptance remain outstanding.
