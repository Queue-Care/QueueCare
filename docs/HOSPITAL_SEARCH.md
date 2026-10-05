# M1-05 — Hospital Search handoff

The Hospital Search screen now consumes M1-04's public MongoDB-backed API. Both guests and patients reach it through **Home → Search hospitals**. No sign-in or JWT is needed for this endpoint. The shared S-13 authentication work remains pending.

## Behavior

- Opening the screen loads active hospitals from `/api/v1/hospitals`.
- Enter a hospital name or city in the main field. The optional City field further restricts results to that exact city name, ignoring case. Tap **Find hospitals** or the keyboard's search key to apply the filters.
- Editing fields does not send a request until submission. Clear filters resets both fields and loads page one. Submitting unchanged filters also refreshes the search.
- Cards display the actual returned name, city, and address. Selecting a card passes its ID to the implemented `HospitalDetails` screen, which loads the hospital and its active OPD services.
- Loading, empty database, no matching results, and failed requests have separate states. Errors offer retry and do not become successful empty results.
- Load more requests the next page of 20. A failed page preserves existing results and retries the same page. Duplicate IDs across pages are removed because the API does not guarantee a pagination snapshot during edits.
- Pull-to-refresh and returning to this screen reload page one with the applied filters. New searches, leaving the screen, and unmounting cancel the previous request. Late responses cannot replace a newer result.
- Requests time out after 15 seconds. The adapter validates the response envelope, hospital fields, and pagination metadata. There is no offline demo fallback or fabricated hospital information.

The screen uses the existing README palette, typography fallbacks, and ActionButton. The nearby `patient-app-screens (1).html` reference describes department/doctor search rather than this hospital search screen; exact matching high-fidelity comparison remains pending. No doctor, distance, or session-availability claims are added without backing data.

## Run in Expo Go

All shell commands below run at the **QueueCare repository root**. MongoDB must be running first. Follow [API setup](../apps/api/README.md) if it is not configured yet.

1. If missing, copy `apps/api/.env.example` to `apps/api/.env`. Use the existing file if already configured.
2. Seed and start the API:

   ```bash
   npm run db:seed:hospitals
   npm run dev:api
   ```

3. If missing, copy `apps/mobile/.env.example` to `apps/mobile/.env`. Set `EXPO_PUBLIC_API_BASE_URL=http://<computer-LAN-IP>:4000/api/v1`. Replace the placeholder with the computer's Wi-Fi IPv4 address. Do not use `localhost` for a physical phone or put API secrets in this public variable.
4. Keep the API terminal running. In a second terminal:

   ```bash
   npm run dev:mobile -- --clear
   ```

5. Connect the phone and computer to the same network, open QueueCare in Expo Go, then **Continue as guest → Search hospitals**.

## Verification and remaining checks

Verification on 2026-10-02: all **70 mobile tests** pass, TypeScript and lint pass without warnings, and Android/iOS Metro exports succeed. These exports are JavaScript/Hermes bundles, not standalone native builds. Automated tests cover the API adapter and real navigation with mocked responses: guest/patient browsing, encoded queries, loading/empty/error states, retry, pagination, refresh, ID navigation, invalid payloads, timeout/cancellation, and stale-response races. The existing backend suite separately exercises the endpoint against real temporary MongoDB. These checks do not replace a phone-to-API smoke test.

Phone checklist:

- Confirm the three fictional seeded hospitals load from the API.
- Search `demo`; filter city to `Colombo`; confirm one result. Search an absent name and clear the filters.
- Tap a card and check that navigation reaches Hospital Details; use Back to return and reload.
- Stop the API, refresh, and confirm an error rather than “no hospitals.” Restart it and tap Try again.
- Check the keyboard, scrolling, large text, and touch targets on the phone. Test load-more with more than 20 active records in a separate development/test dataset.

M1-06's API and M1-07's Hospital Details screen are implemented; see [the handoff](HOSPITAL_DETAILS.md). M1-08’s [Available Sessions API](SESSIONS.md) is implemented. M1-09’s [Book Appointment screen](BOOK_APPOINTMENT.md) is implemented. M1-10’s [booking API](BOOKING_API.md) is implemented. M1-11’s [confirmation action](CONFIRM_APPOINTMENT.md) is implemented. M1-12’s [Booking Confirmation screen](BOOKING_CONFIRMATION.md) is implemented. M1-13’s [booking notification producer](BOOKING_NOTIFICATIONS.md) is implemented; Member 4’s read API/screen integration remains pending. M1-14’s [accessibility refinements](ACCESSIBILITY.md) are implemented. M1-15’s [test coverage and evidence](TESTING.md) are complete. M1-16’s [Home search clarification](PATIENT_HOME.md) is implemented. **Next: M1-17 — improve the View OPD Sessions action.** Authentication, booking data, and the complete booking flow remain separate unfinished work.
