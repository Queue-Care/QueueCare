# Booking Confirmation — M1-12

M1-10/M1-11 are merged in local history through PR #18. M1-12 replaces the confirmation placeholder with a saved booking summary. M1-13’s [booking notification producer](BOOKING_NOTIFICATIONS.md) is now implemented; Member 4’s read API/screen integration is pending. The next independent Member 1 task is **M1-14: accessibility refinements**.

## Implemented behavior

After a successful booking POST, M1-11 replaces the form with `BookingConfirmation({ bookingId })`. The screen reads `GET /api/v1/bookings/:bookingId` using the validated session's patient ID and bearer token. Route parameters contain only the booking ID. No patient profile or credentials are placed in navigation state.

The summary shows the persisted booking code (labelled Booking ID), hospital name/address/city, OPD service, doctor/team, appointment date/time in Asia/Colombo, and booking/session status. The full code wraps and can be selected for copying. View booking passes the database booking ID to Member 2's existing BookingDetails route; Back to Home returns to Patient Home. Member 2's My bookings and BookingDetails screens are still placeholders.

Loading and errors never display a fabricated confirmation. Retry and pull-to-refresh perform GET requests only; a failed summary load does not cancel or recreate the booking. Cancelled, completed, skipped, rescheduled, running, and past appointments use an appropriate heading rather than announcing a new confirmation. Cancelled sessions and unpublished hospitals/services display contact guidance. No notification, reminder, queue position, or estimated wait is promised.

Reads refresh on focus and foregrounding. Blur, backgrounding, unmount, changed route IDs, and changed credentials cancel pending reads; late responses cannot replace newer data. Requests time out after 15 seconds. Authentication errors offer Sign in again through the existing session-expiry callback.

## API and Member 2 handoff

See [the GET contract](API.md#read-booking-summary--implemented-m1-12). This adds the patient-owned read needed for confirmation; booking-list, staff access, cancellation, and rescheduling work remain with their owners. Future static `/bookings/me` routes must be registered before `/:bookingId`.

The server verifies the JWT and current ACTIVE PATIENT account, then scopes the booking query by both booking ID and authenticated patient ID. Missing bookings and other patients' bookings return the same 404. Only explicit public summary fields are returned, with `Cache-Control: no-store`; patient profiles, NICs, and internal notes are excluded.

Existing bookings remain readable when hospitals/services are inactive or sessions are closed/past. Missing or malformed linked data returns 409 `BOOKING_DETAILS_UNAVAILABLE`, not a false cancellation or successful empty summary. These are current linked records, not an immutable snapshot of the appointment when booked. Separate reads may reflect concurrent edits; they do not provide a cross-collection snapshot guarantee. Reading does not reserve capacity, update a booking, or require a replica set. Creating a booking still requires transactions.

## Run and check in Expo Go

Follow [booking API setup](BOOKING_API.md) and [confirmation action setup](CONFIRM_APPOINTMENT.md). Run these from the repository root in separate terminals:

```bash
npm run dev:api
```

```bash
npm run dev:mobile
```

Configure `apps/mobile/.env` with the computer's LAN API address. Real login/token issuance and profile loading must be connected before the authenticated phone flow can be accepted; the default app still starts signed out, and guests retain the sign-in gate. No demo login bypass was added.

After real authentication is connected:

1. Book a future demo session as an active patient. Verify the full code, hospital, service, date/time, and team against the saved records. Confirm one capacity increment and one booking.
2. Check View booking passes the saved ID and Back to Home returns home. The submitted booking form must not reopen on Back.
3. Disconnect the API after booking, then refresh. Verify an error without a success heading. Restore connectivity and retry; no second POST or capacity change should occur.
4. Using an isolated test database, cancel the booking/session or unpublish its hospital/service. Refresh and verify current status and guidance. Try another patient's ID and verify it cannot be read.
5. Check expired sign-in, background/foreground refresh, small-screen wrapping, large text, screen-reader labels, and both platform layouts.

## Verification

All **218 mobile tests** and **57 API tests** pass. Mobile TypeScript, ESLint, and Android/iOS Metro exports also pass.

API tests use isolated temporary MongoDB databases, including a replica set for creation/concurrency tests; no configured Atlas database is modified. Mobile tests use mocked transport with real navigation integration for the create-to-confirmation-to-details flow. Automated coverage includes owner-only reads, public field projection, malformed relations, status changes, response validation, loading/error/retry, refresh, cancellation, and stale responses. Phone-to-API and visual acceptance remain pending.
