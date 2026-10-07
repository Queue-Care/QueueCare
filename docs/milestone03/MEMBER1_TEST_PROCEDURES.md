# A3-05 — Member 1 test procedures

Prepared 2026-10-07. These procedures expand cases M1-T01–M1-T20 for Member 1 and the connected patient flow. They describe existing automated test fixtures; injected clocks, failures and concurrent writes must be run in the isolated test harness, not against the configured development database.

## Execution and evidence rules

Run from the repository root with installed dependencies. API tests require `mongod` on PATH (or `MONGOD_BINARY`) and permission to create temporary localhost servers. They do not load the configured `.env`/Atlas database. Mobile tests simulate API transport; they are not a physical end-to-end test.

```bash
npm run test:api
npm run test:mobile -- --watchman=false
```

For the connected M1-T17 journey only:

```bash
npm run test:patient-flow
```

**Actual results below are historical recorded automation results**, supported by the linked executable cases and [test evidence](../TESTING.md): the full 2026-10-06 opening-hours run passed 82 API tests and 291 mobile tests. This documentation task does not claim a new execution, newly captured raw logs, or screenshots. M1-T19/M1-T20 document tests already in that suite; they do not add two new automated tests. There is no observed failing automated case in that recorded run; device/participant results remain pending unless explicitly attributed to the user.

For a new run, record commit, date/time with time zone, tester, command, Node/OS, exit status, actual result per case, defect ID if any, and the saved log/screenshot path. Use PASS / FAIL / BLOCKED / NOT RUN; a case is not PASS merely because it has a procedure. Store new evidence under `docs/milestone03/evidence/` using fictional accounts and no tokens/passwords. For physical checks also record phone/OS, Expo version, text size and screen reader. Use the [phone matrix](../PATIENT_FLOW_TESTING.md) and [accessibility checklist](../ACCESSIBILITY.md) for the separate device execution.

## Case procedures

### M1-T01

**Hospital search**

- **Preconditions:** Active/inactive hospitals and literal-punctuation names in isolated fixtures.
- **Steps:** Browse; search name/city; apply city filter; page results; simulate no matches, failed page and retry.
- **Expected:** Only active public records match literal filters; pages are stable; errors remain distinct from empty results.
- **Actual / result:** Automated pass recorded: query validation, literal matching, pagination and mobile recovery assertions.
- **Evidence:** [hospitals.test.js](../../apps/api/src/tests/hospitals.test.js); [hospitalQuery.test.js](../../apps/api/src/tests/hospitalQuery.test.js); [HospitalSearchApi.test.ts](../../apps/mobile/__tests__/HospitalSearchApi.test.ts); [HospitalSearch.test.tsx](../../apps/mobile/__tests__/HospitalSearch.test.tsx).

### M1-T02

**Hospital details and service selection**

- **Preconditions:** Active hospital with two active services, inactive/missing parents and an empty catalog.
- **Steps:** Read details/services; try inactive/missing IDs; select first then second service; continue; refresh after removing the selection.
- **Expected:** Public fields only; unavailable parents return 404; one selected service; correct hospital/service IDs reach booking; refresh invalidates selection.
- **Actual / result:** Automated pass recorded: filtering, empty/error states, single selection, route parameters and stale-response checks.
- **Evidence:** [hospitalDetails.test.js](../../apps/api/src/tests/hospitalDetails.test.js); [HospitalDetailsApi.test.ts](../../apps/mobile/__tests__/HospitalDetailsApi.test.ts); [HospitalDetails.test.tsx](../../apps/mobile/__tests__/HospitalDetails.test.tsx).

### M1-T03

**Session availability**

- **Preconditions:** Controlled clock, future/open, started, closed and full sessions belonging to different services.
- **Steps:** Filter by hospital/service/date; inspect remaining places; read again; select a session; change date; refresh after capacity changes.
- **Expected:** Correct future sessions and Sri Lanka times; accurate remaining capacity; reads do not reserve places; invalid/full selections cannot continue.
- **Actual / result:** Automated pass recorded: date boundaries, service isolation, capacity, selection and refresh assertions.
- **Evidence:** [hospitalSessions.test.js](../../apps/api/src/tests/hospitalSessions.test.js); [AvailableSessionsApi.test.ts](../../apps/mobile/__tests__/AvailableSessionsApi.test.ts); [BookAppointment.test.tsx](../../apps/mobile/__tests__/BookAppointment.test.tsx).

### M1-T04

**Create and read a booking**

- **Preconditions:** Temporary replica set, active patient, active hospital/service and one future session with a single free place.
- **Steps:** Follow returned discovery IDs; submit the chosen session once; read the saved summary; inspect capacity, booking and notification records.
- **Expected:** 201 and a persisted unique code; same linked details on GET; one capacity increment and one owned unread notification.
- **Actual / result:** Automated pass recorded: one booking/notification and bookedCount 1; saved code and linked IDs match the POST.
- **Evidence:** [discoveryBookingFlow.test.js](../../apps/api/src/tests/discoveryBookingFlow.test.js); [ConfirmAppointment.test.tsx](../../apps/mobile/__tests__/ConfirmAppointment.test.tsx).

### M1-T05

**Duplicate prevention**

- **Preconditions:** Active patient and future session in the transactional test fixture.
- **Steps:** Send six simultaneous booking requests for the same patient/session; also retry a session with a cancelled booking.
- **Expected:** One new booking for concurrent submissions; five BOOKING_ALREADY_EXISTS errors; cancellation does not bypass the unique patient/session rule.
- **Actual / result:** Automated pass recorded: one 201, five duplicate errors, one reserved place/notification; all-status duplicate assertions pass.
- **Evidence:** [bookings.test.js](../../apps/api/src/tests/bookings.test.js).

### M1-T06

**Capacity under concurrency**

- **Preconditions:** Twelve active patients and a future session with capacity 3, bookedCount 0.
- **Steps:** Send all twelve POST requests concurrently; count responses, persisted bookings, notifications and bookedCount.
- **Expected:** Exactly three successes and nine SESSION_FULL errors; no overbooking; each successful patient owns one booking notification.
- **Actual / result:** Automated pass recorded: three 201 responses, nine full errors and three bookings, places and notifications.
- **Evidence:** [bookings.test.js](../../apps/api/src/tests/bookings.test.js).

### M1-T07

**Session starts during transaction**

- **Preconditions:** Controlled booking clock advances from 1 ms before session start to the exact start during the write.
- **Steps:** Snapshot patient/session state; submit; advance the injected clock at the conditional capacity update; compare stored state.
- **Expected:** 409 and rollback: no booking/notification or reserved capacity, and no retained provisional eligibility writes.
- **Actual / result:** Automated pass recorded: clock-boundary rejection and unchanged stored-state assertions.
- **Evidence:** [bookings.test.js](../../apps/api/src/tests/bookings.test.js).

### M1-T08

**Authentication, validation and eligibility**

- **Preconditions:** Test JWT key, multiple roles/statuses, active fixtures and controlled concurrent deactivation/closure.
- **Steps:** Try missing/expired/invalid JWTs, impersonated body fields and non-patient users; change patient/hospital/session eligibility around submission.
- **Expected:** 401/403/400 or applicable unavailable error; current database eligibility is authoritative; rejected attempts create no booking.
- **Actual / result:** Automated pass recorded: JWT signature/claims, strict payload, account checks and concurrent eligibility revalidation.
- **Evidence:** [bookings.test.js](../../apps/api/src/tests/bookings.test.js); [CreateBookingApi.test.ts](../../apps/mobile/__tests__/CreateBookingApi.test.ts).

### M1-T09

**Atomic rollback and notification reliability**

- **Preconditions:** Temporary replica set; fixture hooks for insert failure, notification failure and transient retry.
- **Steps:** Inject failures after provisional capacity reservation; compare state; force a transient transaction retry; repeat POST after marking notification read.
- **Expected:** Failure rolls back all writes; successful retry commits one booking/event; duplicate POST does not reset readAt.
- **Actual / result:** Automated pass recorded: rollback snapshots, retry event count, uniqueness and retained read-state assertions.
- **Evidence:** [bookings.test.js](../../apps/api/src/tests/bookings.test.js).

### M1-T10

**Saved booking ownership and errors**

- **Preconditions:** Two patients, saved booking, linked records and controlled storage/response failures.
- **Steps:** Read as owner; read as other patient; try invalid ID; inject storage failure; refresh after stored status changes.
- **Expected:** Owner receives current public summary; cross-patient 404; invalid ID 400; storage error is not a fabricated missing/empty response.
- **Actual / result:** Automated pass recorded: ownership, statuses, malformed relations, safe 500 errors and mobile response validation.
- **Evidence:** [bookingDetails.test.js](../../apps/api/src/tests/bookingDetails.test.js); [BookingDetailsApi.test.ts](../../apps/mobile/__tests__/BookingDetailsApi.test.ts); [BookingConfirmation.test.tsx](../../apps/mobile/__tests__/BookingConfirmation.test.tsx).

### M1-T11

**Repeated taps and uncertain outcomes**

- **Preconditions:** Authenticated app fixture with deferred POST, account/token changes and simulated lost responses.
- **Steps:** Tap confirm rapidly; lose the response; revisit/retry deliberately; change tab, token or account while the request is pending.
- **Expected:** One POST for rapid taps; uncertainty persists without automatic retry; late responses cannot open another account’s booking.
- **Actual / result:** Automated pass recorded: submission count, preserved recovery state, abort and account-switch navigation assertions.
- **Evidence:** [ConfirmAppointment.test.tsx](../../apps/mobile/__tests__/ConfirmAppointment.test.tsx); [CreateBookingApi.test.ts](../../apps/mobile/__tests__/CreateBookingApi.test.ts).

### M1-T12

**Accessibility code checks**

- **Preconditions:** React test renderer with iOS/Android accessibility mocks, fake timers and actual theme tokens.
- **Steps:** Change loading to result rapidly; blur/unmount/background during announcement; inspect busy controls, scalable labels, touch minimums and contrast.
- **Expected:** Announcements coalesce/cancel; Android has no duplicate explicit speech; busy controls are disabled; tested contrast/touch thresholds hold.
- **Actual / result:** Automated pass recorded for component semantics/token calculations. Native speech, focus order and clipping are NOT RUN in this record.
- **Evidence:** [Accessibility.test.tsx](../../apps/mobile/__tests__/Accessibility.test.tsx).

### M1-T13

**One clear Home search action**

- **Preconditions:** Guest plus patient loading/empty/error/appointment fixtures.
- **Steps:** Render each Home state; count and locate primary search entry; activate it; inspect guest network calls.
- **Expected:** One primary search action before appointment content, opening HospitalSearch; no guest private appointment request.
- **Actual / result:** Automated pass recorded for all five Home states. First-time-user hesitation and physical layout remain NOT RUN.
- **Evidence:** [PatientHome.test.tsx](../../apps/mobile/__tests__/PatientHome.test.tsx).

### M1-T14

**Session action hierarchy**

- **Preconditions:** Hospital Details fixture with two services, failed/empty catalog variants and deferred refresh.
- **Steps:** Inspect order and touch target; select different services; refresh; inspect loading/empty/error guidance and disabled state.
- **Expected:** View OPD sessions directly follows service choices, before hours/refresh; minimum 52-point height; correct guidance and route IDs.
- **Actual / result:** Automated pass recorded for order, scalable label, target size, guidance and selection invalidation. Physical usability remains NOT RUN.
- **Evidence:** [HospitalDetails.test.tsx](../../apps/mobile/__tests__/HospitalDetails.test.tsx).

### M1-T15

**Home and My Bookings integration**

- **Preconditions:** Two registered patients, server-issued JWTs and bookings with different dates/statuses.
- **Steps:** Login; create booking; read upcoming limit=1; page upcoming/history; open saved detail; retry with another patient and malformed filters.
- **Expected:** Correct owned summaries and stable metadata; earliest relevant Home booking; other patients cannot see the saved records.
- **Actual / result:** Automated pass recorded for HTTP/MongoDB login-to-read journey, category boundaries, pagination, ownership and mobile navigation.
- **Evidence:** [bookingList.test.js](../../apps/api/src/tests/bookingList.test.js); [BookingList.test.tsx](../../apps/mobile/__tests__/BookingList.test.tsx).

### M1-T16

**Booking alert navigation and read state**

- **Preconditions:** Committed booking with owned notification; mobile fixtures for slow/failed receipts, invalid metadata and account replacement.
- **Steps:** List alerts; open valid unread/already-read booking alert; mark read; open saved details; try cross-patient access and late receipt errors.
- **Expected:** Same saved booking opens; persisted read state is owned; invalid links cannot navigate; failed/late receipt cannot redirect another account.
- **Actual / result:** Automated pass recorded in API and mobile layers; physical notification-to-detail acceptance remains NOT RUN.
- **Evidence:** [bookingList.test.js](../../apps/api/src/tests/bookingList.test.js); [BookingNotifications.test.tsx](../../apps/mobile/__tests__/BookingNotifications.test.tsx).

### M1-T17

**Connected patient journey**

- **Preconditions:** Isolated real API/MongoDB fixture plus actual App with simulated HTTP; synthetic accounts and fixed session clock.
- **Steps:** Register; reject wrong password then login; search; choose hospital/service/session; confirm; open details, Home and alert; repeat with a session filled after selection.
- **Expected:** Same saved ID/code across views; one booking POST; wrong login stays signed out; full session creates no false confirmation.
- **Actual / result:** Automated pass recorded for one connected API journey and three app scenarios. User confirmed phone sign-in on 2026-10-07; the remaining phone journey is NOT RUN in this record.
- **Evidence:** [discoveryBookingFlow.test.js](../../apps/api/src/tests/discoveryBookingFlow.test.js); [PatientBookingJourney.test.tsx](../../apps/mobile/__tests__/PatientBookingJourney.test.tsx).

### M1-T18

**Optional opening hours**

- **Preconditions:** Hospital fixtures with missing, multiline, boundary-length and malformed hours; existing edited demo records.
- **Steps:** Read valid/invalid stored values; seed twice after an edit; show hours; remove them and refresh.
- **Expected:** Trimmed valid text up to 500 characters; malformed/missing values omitted; seed preserves edits; refreshed screen uses fallback without invented hours.
- **Actual / result:** Automated pass recorded: API validation/seed preservation, mobile validation and refresh/display assertions. Verified real hours and phone layout remain pending.
- **Evidence:** [hospitalDetails.test.js](../../apps/api/src/tests/hospitalDetails.test.js); [hospitals.test.js](../../apps/api/src/tests/hospitals.test.js); [HospitalDetailsApi.test.ts](../../apps/mobile/__tests__/HospitalDetailsApi.test.ts); [HospitalDetails.test.tsx](../../apps/mobile/__tests__/HospitalDetails.test.tsx).

### M1-T19

**Splash and startup recovery**

- **Preconditions:** App with injected deferred, rejected, unsupported-role and replaced session loaders; production default returns null.
- **Steps:** Hold loader unresolved; resolve signed out; fail then retry/continue signed out; replace loader and resolve obsolete result last.
- **Expected:** Splash persists only while loading; valid result routes correctly; recovery is available; obsolete result cannot replace current identity.
- **Actual / result:** Existing automated pass recorded in Startup.test.tsx. Injected restored sessions do not prove production persistent session restoration.
- **Evidence:** [Startup.test.tsx](../../apps/mobile/__tests__/Startup.test.tsx).

### M1-T20

**Welcome and guest routing**

- **Preconditions:** Signed-out root navigator and public hospital discovery fixtures.
- **Steps:** Choose Get Started then Patient; test existing-account role choices; continue as guest; open search; attempt private booking navigation.
- **Expected:** Correct registration/sign-in routes; guest can browse; booking prompts sign-in; selecting a role alone never authenticates.
- **Actual / result:** Existing automated pass recorded in Navigation.test.tsx. Password-reset navigation does not mean its backend is implemented.
- **Evidence:** [Navigation.test.tsx](../../apps/mobile/__tests__/Navigation.test.tsx).

