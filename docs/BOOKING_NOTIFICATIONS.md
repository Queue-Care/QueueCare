# Booking-confirmed notifications — M1-13

Member 1's creation step is implemented: a successful booking stores one unread in-app notification in MongoDB. M1-12 and M1-13 are merged through PR #19. M1-14’s [accessibility refinements](ACCESSIBILITY.md) are implemented. M1-15’s [test coverage and evidence](TESTING.md) are complete. The next Member 1 task is **M1-16: clarify Hospital Search entry points**.

Member 4's M4-06/M4-07 notification service/API is still a scaffold. This implementation uses README section 13.8's notification schema and a small booking-event producer, ready for Member 4 to consume. Notification list/read/read-all endpoints, live screen data, and notification navigation remain pending. I-03's end-to-end acceptance remains pending until that integration is available. No mobile notification will appear from this change alone.

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

Replace the example ID with the actual saved booking's `_id`, not its displayed `OPD-...` code. Verify exactly one record, correct `userId`, `readAt: null`, and a matching booking/session. Repeat the booking request and verify the notification count stays one. These manual checks and authenticated Expo Go acceptance remain pending; default startup still signs out until the real authentication provider is connected.
