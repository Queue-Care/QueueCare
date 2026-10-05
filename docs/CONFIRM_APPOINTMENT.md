# Confirm Appointment integration — M1-11

M1-10's booking API and M1-11's mobile confirmation integration are merged through PR #18. M1-12's [full Booking Confirmation screen](BOOKING_CONFIRMATION.md) is now implemented. M1-13’s [booking notification producer](BOOKING_NOTIFICATIONS.md) is implemented; Member 4’s read API/screen integration remains pending. M1-14’s [accessibility refinements](ACCESSIBILITY.md) are implemented. M1-15’s [test coverage and evidence](TESTING.md) are complete. M1-16’s [Home search clarification](PATIENT_HOME.md) is implemented. **Next: M1-17 — improve the View OPD Sessions action.**

## Implemented flow

Confirm appointment becomes available only with a selected future bookable session, a loaded patient name, and an in-memory account ObjectId and access token supplied by the authentication provider. Missing authentication/profile data keeps the action disabled; guests retain the sign-in gate.

The adapter sends `POST /api/v1/bookings` with `Authorization: Bearer <token>` and a body containing only `sessionId`. Patient identity is never taken from route data or sent in the body. A response must be HTTP 201 with a valid saved booking, matching patient/session IDs, CONFIRMED status, booking code, and valid UTC timestamps. Unexpected or mismatched responses never navigate to confirmation.

While submitting, the button shows progress; date/session changes and manual refresh are disabled. A synchronous request lock prevents rapid taps from creating simultaneous POSTs. Success replaces the booking form with `BookingConfirmation` using only the persisted `bookingId`. M1-12 now loads the saved appointment summary with an owner-scoped GET and displays the full booking code, hospital, service, date/time, and current status. View booking and Back to Home remain available; Member 2's booking list/details frontend pages are merged; remaining backend integration is pending.

## Failure and recovery

- Full, unavailable, or invalid-session responses show a safe message, refresh availability, and clear selection.
- Duplicate bookings are not treated as new successes. The screen offers Check My bookings and blocks another submission for that session during the current signed-in app session.
- Unauthorized/forbidden responses block the rejected token. Sign in again calls the supplied `onSessionExpired` callback; the current App clears its in-memory session and returns to the signed-out flow. The authentication owner must also clear persisted credentials when storage is implemented. A newly supplied token permits an explicit retry, never an automatic one.
- Service/configuration failures show a temporary-unavailability message. No raw server text, token, or patient data is logged or displayed as an error.
- Timeouts, transport errors, unexpected status/body, and generic server failures are **uncertain outcomes**: the server might already have committed the booking. The ordinary confirmation action remains disabled for that session. Check My bookings is offered; explicitly choosing Retry same session is supported because the server's unique patient/session index prevents another booking. There is no automatic POST retry.

Submission state lives in the patient navigator, above individual screens. Pending requests continue when navigating to another tab; a late success does not take over the visible route. On return, the saved result offers View confirmation. Errors/uncertainty are retained across date changes and navigation during that signed-in app session. Signing out, replacing credentials, or unmounting cancels the transport; late responses cannot navigate into a different account. Changing credentials preserves an interrupted request as uncertain for the same mounted account. State is not persisted across app termination; server duplicate protection remains authoritative.

My bookings cannot yet retrieve an existing booking because Member 2's list API/screens are pending (M1-12's single-booking GET requires a known ID). An uncertain or duplicate response therefore cannot yet recover a saved booking ID through that path. The application does not manufacture a confirmation to hide this integration gap.

## Authentication and setup

The default startup loader still returns signed out. There is no demo login or authentication bypass. Member 2 must supply a validated `NavigationSession` with a MongoDB ObjectId string `userId`, `role: 'PATIENT'`, `accessToken`, and `patient: { fullName, nic? }`. Pass `onSessionExpired` to `AppNavigator` when integrating the real session provider. Never place JWTs or patient profiles in route parameters or public environment variables.

Follow [booking API setup](BOOKING_API.md) for server-only JWT configuration and a transaction-capable MongoDB deployment. From the repository root, seed demo sessions and start the API, then start Expo in a separate terminal:

```bash
npm run check:db
npm run db:seed:sessions
npm run dev:api
```

```bash
npm run dev:mobile
```

Use the computer's LAN IP in `apps/mobile/.env` as described in [API setup](../apps/api/README.md). The phone and computer must share the network. Default demo sessions are for tomorrow in Sri Lanka; use the date printed by the seed.

## Phone checklist after real authentication is connected

1. Sign in as an active patient, select a hospital/service, select a future date/session, and verify the patient summary.
2. Tap Confirm appointment twice quickly. Verify one saved booking, one capacity increment, and navigation with the API's booking ID. Back must not reopen the submitted form.
3. Verify full/unavailable responses refresh the list, expired sign-in returns through the sign-in flow, and a duplicate never shows a new-success message.
4. Interrupt networking during submission. Verify the uncertain message, no automatic retry, and explicit recovery actions. Complete recovery through My bookings once Member 2's read flow is ready.
5. Change tabs while a request is pending. Verify the late response leaves the current route alone and returning exposes the saved result. Verify sign-out/account changes prevent old responses from navigating.
6. Check text scaling, screen-reader announcements, touch targets, and loading/error states in Expo Go.

## Automated verification

All 181 mobile tests pass, including request/response validation, double taps, missing credentials/profile, server error mapping, explicit uncertain retries, stale responses, navigation, sign-out, token replacement, and reauthentication recovery. TypeScript, lint, and Android/iOS Metro exports pass. These use mocked mobile transport responses and do not establish phone-to-API or real-login acceptance. M1-10's separate 50 API tests passed with temporary MongoDB/replica-set transaction tests.
