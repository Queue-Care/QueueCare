# T-04 — patient booking journey verification

As of 2026-10-06, Member 1's M1-01–M1-17 work, booking reads (PR #28), and booking-alert integration (PR #29) are merged. This task adds connected automated journey evidence. **T-04 physical end-to-end acceptance remains pending.**

## Run the automated journey

From the QueueCare repository root, with dependencies installed:

```bash
npm run test:patient-flow
```

The command stops on a failure. It needs `mongod` on PATH (or `MONGOD_BINARY` pointing to the executable) and permission to start temporary localhost servers. It does not read the configured development database, seed Atlas, require the running app server, or use real patient accounts.

| Layer | What actually runs | Scope |
| --- | --- | --- |
| API journey | Express, MongoDB replica set, password registration/login and server-issued JWTs | Register two test patients; reject wrong credentials; discover hospital/service/session using returned IDs; book the final place; retrieve the same saved code through Home/list/details and alert; deny duplicate/full/cross-patient access; verify one booking, capacity increment and notification |
| App journey | Actual `App`, startup hook, forms, authentication handoff, adapters, hooks and navigation; HTTP responses are simulated | Register → sign in → search name/city → select hospital/service/session → confirm → details → Home → booking alert → same saved details, with exactly one booking POST |
| App failure journeys | Same app and simulated transport | Wrong password stays signed out then recovers; a session filled after selection shows recovery instead of a false confirmation |

The mobile tests do not inject a signed-in navigation session or mock the booking/auth adapters. The UI enters credentials and uses the actual sign-in handoff. Fixtures and clocks are explicitly test-only. The API journey no longer manufactures JWTs or inserts authenticated users directly; it obtains them through real registration/login endpoints.

Verified on 2026-10-06: **81 API tests, 280 mobile tests across 22 suites, TypeScript and ESLint pass**. The targeted command passes its one connected API test and three mobile scenarios. App/API production code and dependencies are unchanged in this task. Metro exports were last verified for PR #29's notification work; this test/documentation change does not claim a new native build or device run.

## Physical Expo Go acceptance — to execute and record

Use a development database with fictional test data and future sessions. Follow [API setup](../apps/api/README.md), [patient integration setup](PATIENT_INTEGRATION.md), and [notification checks](BOOKING_NOTIFICATIONS.md). Start the API and Expo from separate root terminals:

```bash
npm run dev:api
```

```bash
npm run dev:mobile -- --clear
```

Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` to the computer's reachable LAN URL ending in `/api/v1`; use the same Wi-Fi for phone and computer. Test-booking creation writes to the configured development database.

| Step | Expected result | Result / evidence |
| --- | --- | --- |
| Create a new fictional patient account | Success leads to sign-in, not an authenticated booking screen | Pending |
| Sign in with the registered NIC and password | Opens the patient app | User confirmed working on 2026-10-07; device/OS and screenshot not recorded |
| Enter a wrong password, then the correct one | Error remains signed out; correct credentials open Home with the actual patient name | Pending |
| Search by known hospital name/city and open it | Correct hospital and available service names load | Pending |
| Select a service and an available future session | Correct IDs/date/time, remaining capacity and signed-in patient appear; Confirm requires a selection | Pending |
| Confirm once | A persisted confirmation code appears; returning Back does not submit again | Pending |
| Open View booking | Same saved code, hospital, service and Sri Lanka date/time | Pending |
| Return Home / My Bookings | Saved appointment appears; Home shows the earliest relevant visit | Pending |
| Open Alerts and tap Booking confirmed | Opens the same booking and persists read state; tapping again still works | Pending |
| Sign out and sign in as a second test patient | First patient's bookings and alerts are absent | Pending |
| Repeat with a full session / interrupted network | Clear full/error/uncertain state, no invented success and no automatic duplicate submission | Pending |

Record device/OS, Expo version, test time, screenshots, booking code and actual pass/fail observations under `docs/milestone03/evidence/`. Keep passwords, JWTs, connection strings and real personal information out of evidence. Automated results must not be copied into this device-result column.

## Remaining ownership

T-04's core booking path now has connected API and app-layer regression coverage. Phone-to-live-server acceptance, usability and accessibility checks still require the actual device. I-01 is not wholly complete: Member 2's cancellation and patient priority backend work, persistent session restoration, other notification destinations and release acceptance remain separate work. There is no M1-18 in the README; next for Member 1 is to execute/record the physical booking journey and fix any observed integration defects with the relevant owners.
