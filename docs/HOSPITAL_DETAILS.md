# M1-06/M1-07/M1-17 — Hospital Details handoff

M1-04/M1-05 hospital search and M1-06's public hospital details/service APIs are implemented and merged. M1-07 now replaces the mobile Hospital Details placeholder with a screen consuming both endpoints. M1-08’s [Available Sessions API](SESSIONS.md) is now implemented. M1-09’s [Book Appointment screen](BOOK_APPOINTMENT.md) consumes session availability. M1-10’s [booking API](BOOKING_API.md) is implemented. M1-11’s [confirmation action](CONFIRM_APPOINTMENT.md) is implemented. M1-12’s [Booking Confirmation screen](BOOKING_CONFIRMATION.md) is implemented. M1-13’s [booking notification producer](BOOKING_NOTIFICATIONS.md) is implemented; Member 4’s read API/screen integration remains pending. M1-14’s [accessibility refinements](ACCESSIBILITY.md) are implemented. M1-15’s [test coverage and evidence](TESTING.md) are complete. M1-16’s [Home search clarification](PATIENT_HOME.md) is implemented. M1-17’s [session-action refinement](HOSPITAL_DETAILS.md#m1-17-session-action-refinement) is implemented. **Next: patient-flow integration and phone acceptance (I-01 / T-04).**

## Run and check

Run commands in the **QueueCare repository root**. Configure the database using [API setup](../apps/api/README.md); retain an existing `apps/api/.env` rather than overwriting it.

```bash
npm run check:db
```

After the connection check succeeds, optionally add the fictional discovery dataset and start the server:

```bash
npm run db:seed:discovery
npm run dev:api
```

The discovery seed inserts missing demo hospitals plus two services for each active demo hospital (six services across the three hospitals). It preserves existing data and edits, including deactivated services. It skips services whose demo parent is missing or inactive. The existing `db:seed:hospitals` command remains hospital-only. No database seeding happens automatically at startup.

In another terminal, or by opening the URLs in a browser:

```bash
curl http://localhost:4000/api/v1/hospitals/000000000000000000000101
curl http://localhost:4000/api/v1/hospitals/000000000000000000000101/services
```

The complete response and error contract is in [API.md](API.md). IDs above are fixed fictional demo IDs; use the `_id` returned by search for other records. No new packages are needed for this task.

## M1-07 behavior

- Hospital Search passes `route.params.hospitalId`. The details adapter loads hospital information and OPD services concurrently without a JWT. It validates IDs, names, addresses, optional phone data, and service ownership; wrong-hospital records, duplicate service IDs, and malformed responses are rejected.
- The screen shows database-backed name, address, city, optional phone, and service names. One radio-style service can be selected at a time. **View OPD sessions** remains disabled until a valid service is selected.
- The action navigates to `BookAppointment` with `{ hospitalId, serviceId }`. `serviceId` is an optional typed route parameter; existing hospital/session routes remain valid. The next screen now supports date/session selection and capacity for patients, with the existing sign-in gate for guests. M1-11 now enables confirmation with a real patient token, loaded profile, and available selected session.
- Loading, hospital failure, hospital unavailable (404/invalid ID), empty services, and service-only failure have distinct states. A service failure retains hospital information and offers retry; it never displays a successful empty catalog. A 404 from either endpoint makes the hospital unavailable.
- Pull-to-refresh clears selection and reloads both endpoints. Retry and refocus reload both too. Requests have 15-second timeouts and are cancelled on blur, unmount, retry, or hospital-ID changes. Late responses cannot replace the current hospital. Selection is usable only while that service is present in the currently loaded hospital catalog.
- Layout uses screen 08 of `opd-high-fidelity-screens .html` as its reference: title/address, OPD services and opening hours. M1-17 follows the README usability feedback by moving the session action directly beside service selection, before opening hours. It uses the app's existing font fallbacks and shared button. Physical-device visual fidelity remains unverified.
- The opening-hours panel explicitly says hours have not been provided. No static prototype hours, session counts, or “Full today” badges are copied into live UI. Supplying actual hours and integrating session availability into this screen remain outstanding; see [design/data limitations](milestone03/DEVIATIONS.md).

## Expo Go check

Keep the API running and set `EXPO_PUBLIC_API_BASE_URL=http://<computer-LAN-IP>:4000/api/v1` in `apps/mobile/.env` (use your actual LAN IP). In a second terminal at the repository root:

```bash
npm run dev:mobile -- --clear
```

1. Open Expo Go, then **Continue as guest → Search hospitals → Demo Central Hospital**.
2. Confirm the hospital address and two seeded services load. No real opening times or session counts should appear.
3. Select General OPD, then Medical clinic. Only the last selection should be checked, and the CTA should become enabled.
4. Tap View OPD sessions. Guests should reach the existing sign-in gate. A validated patient session reaches the implemented session-selection screen; real authentication is still owned separately.
5. Go back and pull to refresh; selection should clear. Stop the API and refresh to check error/retry behavior, then restart it.
6. Check scrolling, large text, radio announcements, touch targets, and Back on the phone. A later database update that removes/deactivates the hospital should show Hospital unavailable after refresh.

## Verification

On 2026-10-02, all **27 API tests passed**, including real temporary MongoDB and HTTP coverage for details, active-parent/service filtering, stable ordering, public-field projection, ID/query validation, empty and not-found states, safe database errors, service indexes, and repeatable seeds. Existing hospital search and shared connection tests also pass.

M1-07 passes all **102 mobile tests**, TypeScript, and lint. Android and iOS Metro exports also pass; these are JavaScript/Hermes bundles, not standalone native builds. Tests cover the public request contract, malformed/cross-hospital responses, empty/error/404 states, single selection and disabled actions, route IDs, guest sign-in gates, refresh, focus, timeout/cancellation, and stale response handling. Mobile tests use mocked HTTP/adapter responses; they do not establish phone-to-API connectivity.

Backend tests create isolated databases and do not modify or verify the configured Atlas/development database. Check that connection separately with `npm run check:db`. The phone checklist above and prototype visual comparison remain pending.

## M1-17 session-action refinement

The previous screen separated service selection from View OPD sessions with opening hours, a note, and Refresh hospital details. The action now appears immediately below the service choices in a tinted panel. Its teal primary button spans the panel width and keeps the shared minimum height of 52 points, minimum width of 48 points, and unrestricted text scaling/wrapping. Refresh remains a secondary outlined action after opening hours. The reference HTML is preserved.

The panel announces the currently selected service. Before selection it explains what to choose; service-load failure and empty catalogs have their own guidance. The CTA is disabled without a currently valid service and hidden while loading or when the hospital cannot be loaded. Refresh clears the selection. The note makes clear that service selection does not reserve a place. Patient navigation retains both hospital/service IDs; guests retain the sign-in gate.

Verified on 2026-10-05: **247 mobile tests across 17 suites**, TypeScript, and Android/iOS exports pass (`/private/tmp/queuecare-m1-17-export`). Lint exits successfully with zero errors and two existing duplicate-import warnings in `PatientPages.test.tsx`. Two new Hospital Details tests guard action order/touch target/text scaling and visible-refresh invalidation; existing tests now check selected-service guidance, empty/error guidance, route IDs and guest gates. API code was not changed or retested in this task.

### Phone and usability acceptance — pending

Use the Expo Go commands above, then:

1. Open a hospital with services. Confirm the primary View OPD sessions button is directly below the choices and before opening hours/Refresh hospital details.
2. Without a selection, confirm the instruction is clear and the button cannot advance. Select two different services in turn; only the latest service name should appear in the guidance and be passed to the next screen.
3. As a guest, verify the sign-in gate. After signing in as a patient, reopen the hospital, select a service and confirm that its sessions load. Login currently returns Home; resuming a guest's interrupted route is not claimed.
4. Refresh after selecting a service. Confirm the selection clears and the action cannot proceed during loading or until a new selection. Check empty services and a service-load failure using a controlled test dataset/network setup.
5. On a small phone, landscape, and enlarged system text, confirm labels wrap, every service and the action can be reached by scrolling, and nothing overlaps or clips. With VoiceOver/TalkBack, check service selection → selected-service guidance → View OPD sessions reading order and disabled-state announcements.
6. Ask a first-time participant to choose a service and find its sessions without pointing out the button. Record hesitation, wrong taps, completion, device/font settings and a screenshot in milestone evidence. Automated tests do not establish physical layout or participant success.

M1-17 implementation is complete locally. **Next: I-01 patient integration and T-04 end-to-end booking acceptance with the other feature owners.**
