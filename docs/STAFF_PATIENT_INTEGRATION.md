# Member 1 / Member 3 session-to-booking integration

Reviewed 2026-10-07 after Member 3's PR #30 and Member 1's PR #35 merged into this checkout. Staff session list/create/edit/close screens and APIs are now present, along with check-in, queue reads/mutations and metrics APIs. Earlier notes describing all staff session writes as pending are historical. Full phone flows and patient queue UI integration are still separate acceptance work.

## Automated HTTP journey

Run from the QueueCare repository root:

```bash
npm run test:staff-patient-flow
```

This runs `apps/api/src/tests/staffPatientBookingFlow.test.js`. It starts an isolated temporary MongoDB replica set and the actual composed Express app. It needs `mongod` on PATH (or `MONGOD_BINARY`) and local listener permission. It never loads the configured API `.env`, writes to Atlas, or seeds the developer database.

The journey fills a gap between Member 3's existing repository lifecycle tests and Member 1's original discovery fixture: the session is now created through the real staff HTTP route, and patient discovery consumes that returned record. Staff and patient tokens come from real registration/sign-in endpoints; authentication is not bypassed. Domain clocks are fixed, while login/JWT verification uses the real current time.

| Step | Verified result |
| --- | --- |
| Register/sign in staff linked to two hospitals and two patients | Server-issued tokens work across the composed routes; a patient cannot create a staff session |
| Staff creates a future session with capacity 2 | Public discovery returns the same session ID, service, Sri Lanka start instant and two available places; no private creator field |
| Patient books the discovered session | Staff reads bookedCount 1; public availability has one place left; Home/list and saved details use the same booking; another patient receives 404 |
| Staff edits capacity to 3 and changes team name | Public availability shows two remaining places; patient saved details show the current team; staff from another hospital cannot edit |
| Staff closes bookings after a patient has read availability | Public availability removes the session; a stale new-booking attempt gets 409 SESSION_UNAVAILABLE; the existing confirmed booking and code remain readable with CLOSED session status |
| Staff checks in the existing booking | Patient and other-hospital staff are denied; authorized staff receives one WAITING entry; repeating check-in returns the same result |
| Read metrics and notifications | Capacity remains 3 and bookedCount remains 1; one patient is checked in/waiting; one booking-confirmed alert belongs to the patient; rejected patient has no alert |

The database assertions verify exactly one booking and one queue entry, not only HTTP status codes. This test does not demonstrate a phone-to-server flow, doctor call-next UI, priority decision flow, or cancellation/rescheduling. Member 3's existing lifecycle tests cover additional queue operations separately.

## Physical cross-member checklist — pending

Follow [setup](SETUP.md) first. Use fictional accounts in the development database. These manual actions intentionally create a session and booking; no such writes were made to the configured database during automated verification.

1. Sign in as staff linked to the same demo hospital the patient will choose. Open Sessions → Add session. Create an OPEN session with capacity 2 and a future start **later today in Asia/Colombo** if demonstrating check-in on the same day. Save its date/service/team. If no practical future time remains today, use tomorrow and defer check-in until that date.
2. As a patient, search for that hospital, select the service and date, and confirm the staff-created session is shown. Book once; save the confirmation code and open its details.
3. Return to staff Sessions and refresh. Verify bookedCount 1. Change capacity to 3 and the team name. Refresh the patient's availability/details and check the changed values.
4. Use a second patient/device to select the still-open session. Close bookings as staff, then try that stale selection. It must show recovery without a new successful confirmation. After refresh, the closed session must not be offered for new booking.
5. Reopen the first patient's saved booking. Confirm the original booking remains, with the current CLOSED session state. Open its booking-confirmed alert and verify the same booking code.
6. With Member 3, demonstrate staff check-in through the supported API/tooling; this document does not claim a new reception check-in button. Verify one queue number and one waiting patient, including after repeat check-in. Booked capacity must not increase again.

Record device/OS, commit, test time, fictional booking/session IDs, screenshots, actual result and any defect in the [patient acceptance matrix](PATIENT_FLOW_TESTING.md) and milestone evidence folder. Do not infer completed physical acceptance from automated test output.

## Merge verification

The initial mobile checks could not load the new `@react-native-community/datetimepicker` dependency, which was declared in the merged manifest/lockfile but missing from local `node_modules`. Dependency installation is required after this merge; use the root setup instructions. Test helpers must not mask that missing runtime dependency.

The full API suite passed **443 tests** on 2026-10-07, including this new journey, booking concurrency and Member 3's session/queue lifecycle tests. After reinstalling dependencies, 453 mobile tests across 29 suites, TypeScript and ESLint also pass; see [TESTING.md](TESTING.md). Bundle exports were not rerun. The new test and npm script do not change production API behavior.
