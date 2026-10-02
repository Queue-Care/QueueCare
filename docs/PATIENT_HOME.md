# M1-03 — Patient Home handoff

The Patient Home frontend and API adapter are implemented. This task is not complete end to end: the backend, JWT restoration, and a real appointment response remain pending. The high-fidelity HTML is still absent, so the screen uses the README design tokens and needs visual comparison.

## Current behavior

- Guest Home offers hospital search and a patient sign-in prompt. It makes no private appointment request.
- Signed-in Home requests the next appointment through the [booking-list contract](API.md). The card shows hospital, service, date/time in Sri Lanka, booking code, and a View booking action.
- View booking opens the Bookings tab's BookingDetails route with the booking ID from the response.
- My bookings and Notifications navigate to their tabs for patients and to sign-in for guests.
- A single prominent Search hospitals entry opens HospitalSearch. It does not duplicate search entry points elsewhere on Home.
- Loading, successful-empty, and failed requests have separate states. A failed request never appears as “No upcoming appointments.”
- Retry, pull-to-refresh, and returning to Home request fresh data. Superseded/blurred requests are cancelled, and late responses cannot replace the current account's data.

Hospital Search and Hospital Details now have their own screens and public API integration; see [M1-05 handoff](HOSPITAL_SEARCH.md) and [M1-07 handoff](HOSPITAL_DETAILS.md). Booking/notification destinations from Home remain placeholders. No appointment or hospital data is fabricated in production code.

## Connect the backend and authentication

1. Implement the endpoint and joined summary described in `docs/API.md`.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env`. Set `EXPO_PUBLIC_API_BASE_URL` to the laptop's LAN API address, including `/api/v1`. The Expo process runs in `apps/mobile`; this is where its environment file belongs. Reload Expo Go after changing it.
3. Member 2's S-13 provider must populate the in-memory `NavigationSession.accessToken` with the current JWT after real validation/restoration. The optional field lets existing navigation fixtures work while authentication is pending; missing tokens produce an error instead of an unauthenticated private request.
4. Supply the restored session through the existing startup/navigation handoff. On expiry, the authentication provider should clear its session and return to signed-out navigation. Home does not store credentials or implement login/logout.
5. Create a real test booking, confirm Home displays it, open its details, cancel it through the eventual booking flow, and return Home to verify refresh.

Only the public API URL belongs in `EXPO_PUBLIC_` configuration. JWTs and backend/Cloudinary secrets do not. See [Expo's environment documentation](https://docs.expo.dev/guides/environment-variables/) for how the public URL is included in the app.

## Files

- `apps/mobile/src/screens/PatientHomeScreen.tsx`: Home layout and state rendering.
- `apps/mobile/src/components/NextAppointmentCard.tsx`: summary display and booking action.
- `apps/mobile/src/features/home/nextAppointment.ts`: authenticated request, timeout, response validation, and mapping.
- `apps/mobile/src/features/home/useNextAppointment.ts`: focus refresh, cancellation, retry, and stale-response protection.
- `apps/mobile/src/navigation/PatientNavigator.tsx`: Home and cross-tab route wiring.

## Verification

TypeScript, lint, and the expanded 44-test suite pass. Tests use synthetic fixtures and mocked HTTP responses, not a live server. Coverage includes successful/empty/error payloads, authentication/configuration failures, timeouts/cancellation, guest access, Sri Lanka time display, booking-ID navigation, focus refresh, pull-to-refresh, and token-change races.

Phone check:

```bash
npm run dev:mobile -- --clear
```

Welcome → Continue as guest now shows the new Home. Check hospital search, sign-in prompts, quick actions, scrolling, and enlarged system text. Signed-in data acceptance requires the backend/authentication steps above. Record real evidence in `docs/milestone03/evidence/` when connected.
