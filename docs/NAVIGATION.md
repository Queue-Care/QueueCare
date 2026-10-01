# S-12 — Navigation handoff

Member 1 has implemented the root, patient, and staff navigation scaffold with React Navigation 7 and Expo-compatible native screens. Splash and Welcome now have dedicated entry screens; Patient Home now has a dedicated frontend and API adapter; other data-driven feature pages remain placeholders. Authentication, API data, and final prototype comparison remain separate tasks.

## Root flow

- Signed out: Welcome → Choose Role → Patient Auth or Staff Auth.
- Get Started opens registration for the chosen role; Existing Account opens sign-in.
- Continue as guest opens patient tabs. Guest Home has a visible Welcome button for returning on iOS and Android.
- A validated patient session opens PatientApp; a validated reception/nurse session opens StaffApp.
- While `isRestoring` is true, navigation shows a loading view. It does not flash another role's screens.
- Changing the authenticated user or role remounts the root stack. Signing out clears authenticated navigation history.

The application runs the startup loader before mounting navigation. The default loader currently returns no session, so it starts signed out; see [startup integration](STARTUP.md). Choosing a role does not log in. Staff-only routes are not registered for anonymous users or patients.

## Routes and ownership

| Navigator | Routes | Feature owner |
| --- | --- | --- |
| Patient auth | PatientSignIn, PatientCreateAccount, VerifyMobile, ResetPassword | Member 2 |
| Staff auth | StaffSignIn, StaffRegistration, StaffVerification, ResetPassword | Members 3/4 |
| Patient Home tab | PatientHome, HospitalSearch, HospitalDetails, BookAppointment, BookingConfirmation | Member 1 |
| Patient Bookings tab | MyBookings, BookingDetails, RequestPriority, PriorityRequestStatus | Member 2 |
| Other patient tabs | Alerts, Profile | Member 4 |
| Staff Dashboard tab | Reception dashboard | Member 3 |
| Staff Sessions tab | SessionsList, AddEditSession | Member 3 |
| Staff Priority tab | PriorityRequests, PriorityRequestDetails | Member 4 |
| Staff Profile tab | Staff profile | Member 4 |

`PatientHome` is the internal name of the Home screen to avoid nesting two routes named `Home`. User-facing tab labels follow README section 11.

## Integration contract

Route types live in `apps/mobile/src/navigation/types.ts`. Pass entity identifiers rather than entire API objects: `hospitalId`, `bookingId`, `requestId`, `sessionId`, or `verificationId`. `AddEditSession` without a session ID means creation; with an ID it means editing. Verification screens must only be opened after the backend creates a verification challenge.

Member 2's S-13 authentication provider should pass `session={{ userId, role }}` and `isRestoring` into `AppNavigator` after validating/restoring the JWT session. Supported roles are PATIENT, RECEPTION, and NURSE. Map unsupported roles to an explicit unsupported-account flow when those roles enter scope. No token storage or login simulation is included in S-12. The API must still enforce authorization on every protected operation.

Guest access permits hospital browsing. Bookings, alerts, profile, appointment creation, and confirmation display a patient sign-in prompt. The Bookings navigator is not mounted for a guest. Feature owners should replace the placeholder components while keeping these access boundaries and typed routes.

Navigation and entry screens share the README-derived tokens in `theme/tokens.ts`. The broader S-10/S-11 design system is still pending. Splash and Welcome are implemented but not yet verified against the missing high-fidelity prototype. No fabricated hospital, appointment, or queue data is used.

## Validation

Automated navigation tests use the real React Navigation navigators with mocked safe-area measurements. They cover registration/sign-in routing, guest access, nested entity parameters, staff routes, session restoration, and clearing history on sign-out. TypeScript and ESLint pass. Expo's offline compatibility check reports dependencies up to date against bundled SDK metadata. Android and iOS Metro exports succeed; these are JavaScript/Hermes bundles, not standalone native app builds.

S-05's initial Expo Go phone launch was confirmed by the user. The new S-12 flows still need a phone smoke test:

1. Run `npm run dev:mobile -- --clear` from the root and open the QR code in Expo Go.
2. Get Started → Patient → Create account; use Back to return through sign-in and role selection.
3. Existing Account → Hospital staff → Staff sign in → Register as staff; check Back.
4. Continue as guest → Search hospitals → Back → Welcome.
5. Continue as guest → Bookings / Alerts / Profile → Patient sign in.
6. Once Member 2 connects real authentication, repeat patient and staff flows with validated sessions and verify logout returns to Welcome.

## Patient Home integration

Patient Home now consumes `NavigationSession.accessToken` when signed in. Its View booking action navigates to `Bookings → BookingDetails` with the returned booking ID. Quick actions navigate to Bookings or Alerts, while guests are directed to PatientAuth. Home refreshes when focused again. See [M1-03 handoff](PATIENT_HOME.md).
