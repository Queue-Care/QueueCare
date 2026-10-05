# Member 1 test evidence — M1-15

M1-04..M1-13 already have API and mobile tests. M1-15 reviews those tests, adds the missing connected API journey and failure/race cases, and fixes the account-switch navigation defect exposed by a new regression test. M1-14's accessibility changes remain in this working tree. M1-14/M1-15 are local and uncommitted; M1-12/M1-13 are merged through PR #19.

## Reproduce

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

Real login/token issuance/session restoration, remaining Member 2 backend flows, and Member 4 notification APIs are incomplete. Physical Expo Go testing, assistive-technology speech/layout checks, usability participants, screenshots, and production network-failure/replica-set failover evidence remain pending. Follow the [confirmation checklist](BOOKING_CONFIRMATION.md) and [accessibility checklist](ACCESSIBILITY.md); do not report mocked mobile transport as completed phone acceptance.

**Next Member 1 task: M1-16 — remove or clarify duplicate Hospital Search entry points based on the usability feedback.**
