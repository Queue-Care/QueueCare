# Member 1 test evidence — M1-15 through M1-17

M1-04..M1-13 already have API and mobile tests. M1-15 reviews those tests, adds the missing connected API journey and failure/race cases, and fixes the account-switch navigation defect exposed by a new regression test. M1-14/M1-15 are merged through PR #22; the current branch also includes the design update through PR #23.

## I-01 booking-read integration — 2026-10-05

M1-17 is merged through PR #26. The missing authenticated `/bookings/me` route now connects Home and My Bookings, with server-side category filtering/pagination and mobile page controls. **74 API tests and 255 mobile tests across 18 suites pass**, along with TypeScript, ESLint (no warnings), and Android/iOS exports in `/private/tmp/queuecare-patient-integration-export`.

New API evidence covers real registration/login → booking → Home/list → saved details, owner isolation, current account role/status, pagination and session-time boundaries. New mobile evidence covers navigation with saved IDs, token forwarding, page/category changes, stale responses and retry. API tests use isolated temporary MongoDB; mobile HTTP is mocked. See [scope, reproduction and outstanding phone checks](PATIENT_INTEGRATION.md). I-01/T-04 remain partial while other modules and physical acceptance are pending.

## M1-17 follow-up — 2026-10-05

M1-16 is merged through PR #25, alongside PR #24's patient registration/sign-in work. M1-17 moves View OPD sessions next to service selection and gives accurate selected/empty/failure guidance. Two new tests check primary action order, existing 52-point minimum height, scalable labels, and visible-refresh invalidation; the guest/patient route and state tests now assert the guidance too.

**247 mobile tests across 17 suites, TypeScript, and Android/iOS exports pass.** ESLint exits successfully with no errors and two pre-existing duplicate-import warnings in `PatientPages.test.tsx`. Exports: `/private/tmp/queuecare-m1-17-export`. API code was not changed or rerun for M1-17; historical API counts below do not cover the newly merged auth tests. Phone/participant acceptance is pending; see the [CTA checklist](HOSPITAL_DETAILS.md#m1-17-session-action-refinement).

## M1-16 follow-up — 2026-10-05

After the design merge, Home still had one search entry, but it followed appointment/sign-in content. M1-16 moves it first and clarifies guest browsing. Five new cases in `PatientHome.test.tsx` check one enabled primary search action before appointment actions and successful navigation for guest, loading, empty, error, and appointment states; guest browsing makes no private appointment request.

Verified with Node v25.9.0: **244 mobile tests across 17 suites, TypeScript, ESLint, and Android/iOS exports pass**. Exports are in `/private/tmp/queuecare-m1-16-export`. API code is unchanged; the 64-test API result below is the previous M1-15 run, not a new run. Phone visual/accessibility and participant checks remain pending; see the [Home checklist](PATIENT_HOME.md).

## Reproduce M1-15 evidence

Verified on **2026-10-04**, using Node **v25.9.0**:

| Check | Result |
| --- | --- |
| API tests | 64 passed; 0 failed/skipped |
| Mobile tests | 239 passed across 17 suites; 0 failed/skipped |
| Mobile TypeScript | Pass |
| Mobile ESLint | Pass |
| Android/iOS Metro exports | Pass; generated under `/private/tmp/queuecare-m1-15-export` |

Run from the repository root with installed workspace dependencies:

```bash
npm run test:api
npm run test:mobile -- --watchman=false
npm run typecheck:mobile
npm run lint:mobile
```

The API suite needs `mongod` on PATH, or an absolute executable path in `MONGOD_BINARY`. Its helper owns temporary directories, local HTTP listeners, and MongoDB processes; transaction tests initialize temporary single-node replica sets. Cleanup is registered with the test runner. The tests never load `apps/api/.env`, seed the development database, or connect to Atlas. Tests use fixed clocks and test-only users/JWT keys, so dates do not expire with the calendar.

Mobile tests use Jest/React test rendering, mocked API transport, and real navigation components. The API journey uses actual HTTP, JWT verification, repository code, and MongoDB. These are complementary integration layers, not a phone-to-server end-to-end test or proof of production login.

## New coverage

| Gap | Evidence added |
| --- | --- |
| Separate route tests could miss incompatible IDs or stale availability across the flow | `apps/api/src/tests/discoveryBookingFlow.test.js` follows returned IDs from search → hospital → service → availability → POST → saved summary; verifies the last place becomes full, duplicate and second-patient attempts fail, and one owned notification exists |
| Session can start after the first eligibility check | `bookings.test.js`: `session starting between eligibility read and capacity write rolls back every write` advances the controlled clock from 1 ms before start to exactly start; expects 409 and unchanged stored state |
| Booking-summary storage errors must not look like missing data | `bookingDetails.test.js`: injected storage failure returns generic 500 without driver text; a healthy read still succeeds |
| Unexpected mobile read responses must not fabricate confirmation | `BookingDetailsApi.test.ts`: invalid JSON, unexpected 202, and transport failure reject without automatic retries |
| Direct patient-to-patient switch while a booking is pending | `ConfirmAppointment.test.tsx`: transport aborts, history returns to Home, a late result cannot navigate/display the old booking, and the new account can select a fresh session |

The account-switch test initially failed: React-keying only the nested root navigator left navigation state owned by `NavigationContainer`. The fix keys the container by user ID and role (or signed-out identity), clearing the entire navigation history on an identity change. The token is deliberately excluded, so same-account token refresh retains recovery state. Existing sign-out, token replacement, and late-response tests continue to cover those distinctions. See [issue evidence](milestone03/ISSUE_AND_FIX_LOG.md).

## Existing coverage retained

- Discovery: literal search, city filters, stable pagination, active hospital/service scope, public projections, malformed IDs/queries, errors, and non-destructive seeds.
- Availability: Sri Lanka date boundaries, future-start cutoff, service/date filtering, full/overfull sessions, invalid stored records, and reads that do not reserve capacity.
- Booking: verified account identity/role/status, strict payloads, all-status duplicate protection, 12 patients competing for 3 places, 6 simultaneous duplicate requests, concurrent hospital/session changes, rollback, and standalone rejection.
- Notifications: one owned unread record per committed booking, no read-state reset after duplicate POST, notification-failure rollback, transient transaction retry, and partial-index scope. List/read APIs and phone notification display remain Member 4's pending integration.
- Mobile: guest gates, selection invalidation, loading/empty/error states, explicit retry, double-tap prevention, uncertain outcomes, sign-out/account changes, stale-response cancellation, confirmation data validation, and accessibility regressions.

See the [functional cases](milestone03/FUNCTIONAL_TEST_CASES.md), [CRUD evidence](milestone03/CRUD_MATRIX.md), and [requirement mapping](milestone03/TRACEABILITY_MATRIX.md). Counts are test-runner totals, not coverage percentages or a claim that every project requirement is complete.

## Remaining acceptance work

Patient registration/JWT sign-in and the in-memory session/profile handoff are now present through PR #24. Persistent session restoration, remaining Member 2 backend flows, and Member 4 notification APIs are incomplete. Physical Expo Go testing, assistive-technology speech/layout checks, usability participants, screenshots, and production network-failure/replica-set failover evidence remain pending. Follow the [confirmation checklist](BOOKING_CONFIRMATION.md) and [accessibility checklist](ACCESSIBILITY.md); do not report mocked mobile transport as completed phone acceptance.

**Next Member 1 work: I-01 patient integration and T-04 end-to-end booking acceptance with the other feature owners.**
