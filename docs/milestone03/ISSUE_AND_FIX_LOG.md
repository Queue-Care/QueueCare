# Issue and fix evidence

## T-04-M1-01 — patient sign-in unavailable due to local setup

- **Found:** 2026-10-07. User saw “This service is not available yet” while signing in. Inspection found no mobile `.env`/API base URL, no backend JWT secret and no API listener on port 4000 at the time of diagnosis.
- **Fix:** Added the mobile LAN API URL and a generated JWT secret to ignored local environment files, preserving existing database settings. Started the backend and instructed the user to restart Expo with `--clear`. No secret values are included in this evidence.
- **Verification:** Configured MongoDB ping succeeded; backend `/health` returned connected; the isolated patient-login test passed. The user subsequently confirmed “Yes, sign-in works” on 2026-10-07.
- **Limit:** Confirmation is user-reported phone sign-in only. Device/OS, screenshots, wrong-password recovery and the remaining physical booking journey are not yet recorded. A LAN address may change when the computer changes networks; teammates need their own environment setup.


## I-03-M1-01 — booking alert loses its destination in the client

- **Found:** 2026-10-06, after PR #28 and Member 4 integration. The API returns `data.bookingId`, but the mobile notification parser dropped metadata and tapping the row only marked it read.
- **Fix:** Retain only validated booking-confirmed IDs, show View booking, and route patient Alerts to authenticated Booking Details. Read receipts run independently of navigation; already-read alerts still open. Late receipt errors are ignored after token replacement/unmount.
- **Evidence:** A real API test follows registration/login → booking → notification list → details → mark-read and checks cross-patient denial and duplicate/read-state persistence. Eleven mobile cases cover valid/invalid metadata, read/unread links, slow/failed receipts, missing details and account replacement. All 81 API and 277 mobile tests, TypeScript, lint and both exports pass.
- **Limit:** Physical Expo Go acceptance and other notification destinations remain pending. See [phone checklist](../BOOKING_NOTIFICATIONS.md#open-a-saved-booking-from-alerts--2026-10-06).

## I-01-M1-02 — merged Home redesign restores duplicate search

- **Found:** The full mobile suite failed five Home-state regressions. The redesign replaced the search button with a styled Pressable and restored the Find a hospital quick-action tile, reintroducing M1-16's usability issue.
- **Fix:** Keep the redesigned search control before appointment content; remove the duplicate tile and restore guest guidance. Retain the new fonts, colors and other Home controls. Update assertions to target the accessible button and reading order rather than the previous component type.
- **Evidence:** All five guest/loading/empty/error/appointment cases pass; phone visual acceptance remains pending.

## I-01-M1-01 — signed-in Home and My Bookings cannot read saved appointments

- **Found:** 2026-10-05, integration review after PR #26. Both clients request `/bookings/me`, but the API only had POST `/bookings` and GET `/bookings/:bookingId`; `me` failed ID validation.
- **Fix:** Add the owner-scoped list route before the ID route, category/time filtering and pagination. Connect the Bookings screen to page metadata and Previous/Next/Refresh.
- **Evidence:** Real registration/JWT login → booking → Home/list/details passes against temporary MongoDB. Tests verify second-patient isolation, permissions, ordering/boundaries, pagination, malformed requests and storage failures. Mobile navigation/transport tests check saved IDs, token use, stale response cancellation and errors. All 74 API / 255 mobile tests, TypeScript, lint and both platform exports pass.
- **Limit:** Full patient-tab, cancellation/priority/notification/profile integration and phone acceptance remain pending. See [handoff](../PATIENT_INTEGRATION.md).

## M1-17-01 — make View OPD sessions the clear next action

- **Source:** README usability feedback records hesitation around the View OPD Sessions CTA; M1-17 requests clearer hierarchy and an adequate touch target.
- **Reviewed:** 2026-10-05, after PR #25. The action followed opening hours, a note, and the secondary refresh action, separate from service selection.
- **Change:** Place the full-width primary action immediately below the service choices in a highlighted panel. Show the selected service or specific selection/error/empty guidance. Move refresh after opening hours. Retain the existing 52-point minimum button height and scalable label.
- **Evidence:** `HospitalDetails.test.tsx` covers action order, touch target/scaling, selection guidance, refresh invalidation, empty/error states, correct route IDs and guest gates. All 247 mobile tests, TypeScript and Android/iOS exports pass; lint has zero errors and two pre-existing duplicate-import warnings in patient-page tests.
- **Limit:** Physical touch/layout, screen-reader behavior and participant hesitation still require the [phone checklist](../HOSPITAL_DETAILS.md#m1-17-session-action-refinement). No participant outcome is inferred from automated tests.

## M1-16-01 — clarify the first hospital-search action

- **Source:** Root README usability feedback and screen 06 of `opd-high-fidelity-screens .html`, which shows both a search-shaped entry and a Find a hospital quick-action tile.
- **Reviewed:** 2026-10-05, after PR #23. The running Home already had one search button, but it followed appointment/sign-in content; no new participant observation is claimed.
- **Change:** Place the single primary Search hospitals action before appointment content. Explain name/city search and guest browsing, add a destination hint, and keep refresh inside the appointment section.
- **Regression evidence:** Five Home navigation cases cover guest, loading, empty, error, and saved appointment states. Each exposes one enabled primary search action first and opens HospitalSearch; guests make no private appointment request. All 244 mobile tests, TypeScript, lint, and Android/iOS exports pass.
- **Limit:** Phone layout, native screen-reader order, and first-time participant acceptance remain pending. Follow the [Home checklist](../PATIENT_HOME.md).

## M1-15-01 — previous patient's route survives a direct account switch

- **Found:** 2026-10-04, automated regression in `ConfirmAppointment.test.tsx`.
- **Trigger:** Start a booking as patient A, then supply a validated patient B session without an intermediate signed-out render.
- **Observed before fix:** The pending transport was aborted, but `getCurrentRoute().name` remained `BookAppointment` instead of `PatientHome`. Keying only `Root.Navigator` did not clear state held by its parent navigation container.
- **Fix:** Key `NavigationContainer` by user ID and role, or signed-out identity. Account/role changes now discard navigation history and mounted per-account submission state. Token changes for the same identity keep the container, retaining uncertain-result recovery.
- **Regression evidence:** The new test asserts abort, return to Home, ignored late success, no old booking details read/display, and a fresh selectable booking for the second account. Existing token-replacement, sign-out and navigation tests also pass.
- **Limit:** Reproduced and verified with real navigation under React test rendering and mocked transport. Physical authenticated account-switch acceptance is still pending.
