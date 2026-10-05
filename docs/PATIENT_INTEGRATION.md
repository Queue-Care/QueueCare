# Patient booking-read integration — I-01 / T-04 progress

The booking-read change below is merged through PR #28. As of 2026-10-06, M1-01 through M1-17 are implemented in local history; M1-17 is merged through PR #26. Device, usability and broader integration acceptance remain open. The next Member 1 integration step closes a concrete gap: Home and My Bookings requested `/bookings/me`, but Express matched `me` against the booking-ID route and rejected it. A signed-in patient could create a booking but could not retrieve it through these lists.

## Implemented in this change

- Added authenticated `GET /api/v1/bookings/me`, before the booking-ID route. It uses the verified JWT's current ACTIVE PATIENT identity; query parameters cannot select another account.
- Added server-side Upcoming/Past filtering, Sri Lanka session times, stable sorting, bounded pagination and no-store responses. Home's existing `status=upcoming&limit=1` adapter now receives its next appointment.
- Connected My Bookings to the paginated contract, with Previous/Next/Refresh, page reset on category changes and existing focus/abort protection. Selecting a row uses the existing authenticated booking-details endpoint.
- Reused booking-detail validation/public projections. Inactive hospital/services remain readable; missing or invalid linked data produces an error rather than fabricated or silently omitted appointments. No booking, capacity or notification writes occur during list reads.
- Updated the older patient-page test fixture to include pagination metadata and consolidated its duplicate type imports, resolving the previous lint warnings.

The [API contract](API.md#patient-home--my-bookings--implemented-booking-list-i-01-read-integration) defines category boundaries, query limits and the lack of a snapshot guarantee during concurrent changes. Reads scan the patient's own bookings, then validate at most 50 selected summaries; production-scale load testing remains pending.

## Verified locally

| Check | Result |
| --- | --- |
| API tests | 74 passed; no failures/skips |
| Mobile tests | 255 passed across 18 suites |
| Mobile TypeScript / ESLint | Pass; no lint warnings |
| Android / iOS Metro export | Pass; `/private/tmp/queuecare-patient-integration-export` |

`bookingList.test.js` uses actual HTTP, registration, password login, server-issued JWTs and an isolated MongoDB replica set. It creates a booking, reads Home/list/details, verifies capacity and notification persistence, and checks second-patient isolation, role/status enforcement, malformed filters, pagination, running/end-time/cancelled-session boundaries and database failures. It never uses the configured development/Atlas database.

`BookingList.test.tsx` uses real navigation and mocked HTTP responses to verify Home → details, paginated Bookings → details, token forwarding, category reset, cancelled requests/late responses, error recovery and malformed pagination rejection. Existing discovery and confirmation tests remain green. These complementary layers do not constitute a completed physical-phone end-to-end test.

Reproduce from the repository root:

```bash
npm run test:api
npm run test:mobile -- --watchman=false
npm run typecheck:mobile
npm run lint:mobile
```

API tests require `mongod` and permission to run temporary localhost servers. Existing developer lockfile edits were preserved; no dependencies were added.

## Expo Go acceptance — pending

1. Configure MongoDB and JWT settings following `apps/api/README.md`. Booking creation requires Atlas or a local replica set. Check connectivity with `npm run check:db`.
2. If needed, explicitly add fictional future discovery/session data using `npm run db:seed:sessions`. This command writes demo records to the configured database; use the team's development database. Do not reseed just to inspect an existing booking.
3. Start `npm run dev:api`. Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` to the computer's reachable LAN URL ending in `/api/v1`.
4. In another terminal at the root, run `npm run dev:mobile -- --clear`, then open Expo Go.
5. Register/sign in with a test patient. A new account should see No upcoming appointments and no bookings. Search a demo hospital, choose a service, select tomorrow's available session, and confirm once.
6. Record the confirmation code. View booking must show that same code. Return Home and confirm its next-appointment card appears (or the earliest other relevant booking if the account already has one).
7. Open My Bookings. Confirm the booking appears under Upcoming and opens the same saved details. Verify Past with existing completed/cancelled test data, page controls with more than 20 test bookings, refresh and network-error retry. Do not expect the cancellation button to succeed until its backend is implemented.
8. Restart and sign in as a second test patient. Confirm the first patient's appointments are absent. Restart currently requires login because sessions remain in memory.
9. Record actual device/OS, screenshots, code consistency and failures in milestone evidence. Check large text and screen-reader reading order on the actual phone.

## Remaining work and owner handoff

**I-01 and T-04 remain partial.** This delivers their booking-read portion, including the shared list read used by Member 2's pages. Member 2 still owns cancellation and priority-request backend operations; their current UI actions can return errors until those APIs exist. Member 4's Alerts/Profile APIs and live patient tabs are now present. The [booking-alert follow-up](BOOKING_NOTIFICATIONS.md#open-a-saved-booking-from-alerts--2026-10-06) connects booking-confirmed alerts to saved details and verifies the I-03 producer/consumer API flow. Physical notification/patient-flow acceptance and other alert destinations remain pending.

Next: complete patient tabs with Members 2/4, verify registration/login → discovery → booking → details on Expo Go, and record phone/accessibility/usability evidence. Persistent session restoration, opening-hours data, full prototype fidelity and standalone release work also remain open. This change does not claim all Member 1 acceptance criteria or the whole project are complete.
