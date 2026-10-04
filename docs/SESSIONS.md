# Available Sessions API — M1-08

M1-07's Hospital Details screen is merged. M1-08 implements the public session availability endpoint, date/service validation, capacity calculation, MongoDB index, and repeatable fictional session seed. M1-09’s [Book Appointment screen](BOOK_APPOINTMENT.md) now consumes this endpoint; guests still see the sign-in gate. M1-10’s [protected booking API](BOOKING_API.md) is also implemented. M1-11’s [confirmation action](CONFIRM_APPOINTMENT.md) is implemented. M1-12’s [Booking Confirmation screen](BOOKING_CONFIRMATION.md) is implemented. M1-13’s [booking notification producer](BOOKING_NOTIFICATIONS.md) is implemented; Member 4’s read API/screen integration remains pending. M1-14’s [accessibility refinements](ACCESSIBILITY.md) are implemented. M1-15’s [test coverage and evidence](TESTING.md) are complete. **Next: M1-16 — clarify Hospital Search entry points.** Real login/token issuance is still required.

## Run and check

Run these commands from the **QueueCare repository root** with MongoDB configured in `apps/api/.env`:

```bash
npm run check:db
npm run db:seed:sessions
npm run dev:api
```

Only seed after the database check succeeds. The seed writes to the configured database; it does not fix an Atlas connection failure. It inserts missing fictional hospitals, services, and sessions without replacing existing records. By default it creates two sessions per active demo service for **tomorrow in Asia/Colombo**, and prints the date. Use that printed date in the request below; the example date is illustrative.

In another terminal:

```bash
curl 'http://localhost:4000/api/v1/hospitals/000000000000000000000101/sessions?date=2026-10-03&serviceId=000000000000000000000201'
```

Expect two future sessions for General OPD at 09:00 and 11:00, initially with 20 remaining places. Existing edits to demo records are preserved and can change this result. Omitting `serviceId` returns all active services for the hospital. Omitting `date` selects **today**, so it will not show tomorrow's seed. Once a session starts it disappears from this endpoint.

To seed a specific date, replace the example with your intended future day:

```bash
npm run db:seed:sessions -- --date=2026-10-03
```

Rerunning for the same date adds no duplicates and does not reset capacity or status. Different dates intentionally add new sessions. Missing/inactive demo parents are skipped. These are system demo records without a staff `createdById`; real staff-created sessions must identify their authenticated author.

## Contract and storage handoff

See [API response and validation](API.md#available-sessions--implemented-m1-08) and [MongoDB storage conventions](DATABASE.md#opd-sessions--m1-08-read-api).

- Only future `OPEN` sessions under active hospitals/services appear. Closed, cancelled, running, completed, and already-started sessions are excluded.
- Full sessions remain visible with zero remaining capacity and `isBookable: false`. Negative remaining capacity is never returned.
- A valid empty day returns HTTP 200 with `data: []`. Invalid filters return 400; missing/inactive hospitals or selected services return 404. Database errors return 500.
- Store the date as a UTC-midnight BSON day marker, and `HH:mm` times as Asia/Colombo local times. The API returns both that local date/time and unambiguous UTC `startsAt`/`endsAt`. Overnight sessions are unsupported. Member 3's future session writes must follow this convention.
- Invalid stored dates, times, counts, IDs, and required display fields are excluded. The endpoint does not invent session data or waiting counts.

M1-09 now consumes `hospitalId` and `serviceId` already supplied by Hospital Details. Its date controls load this endpoint, and only one `isBookable` future session can be selected. It displays capacity and a patient-summary handoff with loading, empty, error, retry, and refresh states. Times display in Asia/Colombo even when the phone timezone differs.

Availability is a read-time snapshot and does not reserve a place. M1-10 now provides authenticated, transactional booking creation and duplicate/full-session protection; M1-11 now connects the confirmation action for validated patient sessions. Real authentication, staff session writes, and phone acceptance testing remain separate unfinished work.

## Verification

`npm run test:api` passes 38 tests using isolated temporary MongoDB and HTTP servers. Coverage includes timezone/date boundaries, strict filters, active parent/service scoping, future-start cutoff, full/overfull capacity, malformed records, stable ordering, safe errors, public fields, and repeatable seeds that preserve edits. Tests do not use the configured development/Atlas database.
