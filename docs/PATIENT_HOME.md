# M1-03 / M1-16 — Patient Home handoff

The Patient Home frontend and API adapter are implemented. The I-01 booking-read integration now supplies real appointment summaries through `/bookings/me`; JWT restoration and physical end-to-end acceptance remain pending. The current prototype is `opd-high-fidelity-screens .html`. The PR #23 design tokens are retained; phone visual comparison remains pending.

## Current behavior

- Guest Home offers hospital search and a patient sign-in prompt. It makes no private appointment request.
- Signed-in Home requests the next appointment through the [booking-list contract](API.md). The card shows hospital, service, date/time in Sri Lanka, booking code, and a View booking action.
- View booking opens the Bookings tab's BookingDetails route with the booking ID from the response.
- My bookings and Notifications navigate to their tabs for patients and to sign-in for guests.
- M1-16 places the single primary Search hospitals action directly after the introduction, before appointment/sign-in content. The Find a hospital heading matches the destination. Copy explains name/city search and that guests can browse without signing in; an accessibility hint describes the destination. Quick actions contain only bookings and notifications.
- Appointment refresh is grouped with the appointment content. Search remains available while appointments load or fail.
- Loading, successful-empty, and failed requests have separate states. A failed request never appears as “No upcoming appointments.”
- Retry, pull-to-refresh, and returning to Home request fresh data. Superseded/blurred requests are cancelled, and late responses cannot replace the current account's data.

Hospital Search and Hospital Details now have their own screens and public API integration; see [M1-05 handoff](HOSPITAL_SEARCH.md) and [M1-07 handoff](HOSPITAL_DETAILS.md). Booking list/details are connected to authenticated backend reads. Notification backend/display integration remains pending. No appointment or hospital data is fabricated in production code.

## Connect the backend and authentication

1. The endpoint and joined summary described in `docs/API.md` are implemented. Start the API with database and JWT settings from its setup guide.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env`. Set `EXPO_PUBLIC_API_BASE_URL` to the laptop's LAN API address, including `/api/v1`. The Expo process runs in `apps/mobile`; this is where its environment file belongs. Reload Expo Go after changing it.
3. Use the patient sign-in screen, now connected to JWT login and an in-memory session. Persistent S-13 restoration is still pending; signing in again is required after restart. Missing tokens produce an error instead of an unauthenticated private request.
4. For future restoration, supply the validated session through the existing startup/navigation handoff. On expiry, the authentication provider should clear its session and return to signed-out navigation. Home does not store credentials or implement login/logout.
5. Create a real test booking, confirm Home displays it, open its details, cancel it through the eventual booking flow, and return Home to verify refresh.

Only the public API URL belongs in `EXPO_PUBLIC_` configuration. JWTs and backend/Cloudinary secrets do not. See [Expo's environment documentation](https://docs.expo.dev/guides/environment-variables/) for how the public URL is included in the app.

## Files

- `apps/mobile/src/screens/PatientHomeScreen.tsx`: Home layout and state rendering.
- `apps/mobile/src/components/NextAppointmentCard.tsx`: summary display and booking action.
- `apps/mobile/src/features/home/nextAppointment.ts`: authenticated request, timeout, response validation, and mapping.
- `apps/mobile/src/features/home/useNextAppointment.ts`: focus refresh, cancellation, retry, and stale-response protection.
- `apps/mobile/src/navigation/PatientNavigator.tsx`: Home and cross-tab route wiring.

## Verification

On 2026-10-05, all 244 mobile tests across 17 suites, TypeScript, lint, and Android/iOS bundle exports pass. Tests use synthetic fixtures and mocked HTTP responses, not a live server. Coverage includes successful/empty/error payloads, authentication/configuration failures, timeouts/cancellation, guest access, Sri Lanka time display, booking-ID navigation, focus refresh, pull-to-refresh, and token-change races.

Phone check:

```bash
npm run dev:mobile -- --clear
```

Welcome → Continue as guest now shows the new Home. Check hospital search, sign-in prompts, quick actions, scrolling, and enlarged system text. Signed-in data acceptance requires the backend/authentication steps above. Record real evidence in `docs/milestone03/evidence/` when connected.

## M1-16 usability decision and phone acceptance

The prototype's Home (screen 06) contains both a search-bar-shaped entry and a Find a hospital quick-action tile. The app already had one search action; this change strengthens its hierarchy and explanation rather than claiming a duplicate was removed from the running app. The root README explicitly calls for one clearly primary entry. The reference HTML is preserved.

Run the command above from the repository root and open Expo Go:

1. Choose Continue as guest. Confirm Find a hospital and its Search hospitals button appear before the sign-in/appointment section, with no competing search tile or input on Home.
2. Tap Search hospitals. Confirm it opens Find a hospital with name/city filters without requiring sign-in. Go back and repeat.
3. With the API configured, search a known demo hospital/city and open its details. Public browsing should work; booking retains its existing sign-in requirement.
4. Once real authentication is connected, repeat with no appointment, a saved appointment, and an appointment loading/error state. Search must remain available; retry/refresh and booking actions must retain their meanings.
5. On a small phone and with enlarged text, check wrapping, scrolling, touch targets, and VoiceOver/TalkBack order: introduction → search → appointment → quick actions.
6. Ask a first-time tester, without pointing to a control: “Find a hospital in your city.” Record their first tap, any sign-in confusion, success/failure, device/font settings, and screenshots in milestone evidence.

Automated navigation checks pass for all five Home states. Physical-device and participant results are **pending**; no usability success rate is claimed. M1-17’s [session-action refinement](HOSPITAL_DETAILS.md#m1-17-session-action-refinement) is implemented. **Next: patient-flow integration and phone acceptance (I-01 / T-04).**
