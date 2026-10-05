# QueueCare rounded UI redesign

## Reference

The only visual reference for this pass is `opd-high-fidelity-screens .html`, the workspace filename with a space before `.html`. Its title is “Government Hospital OPD — High-Fidelity Screens”; it is the rounded design requested as `opd-high-fidelity-screens.html`. Reference files were not edited or renamed. Existing HTML additions/deletions were left untouched.

## Design mapping

- Palette: mist #F5F8F7, white #FFFFFF, ink #17302A, muted #4A625C, teal #0E6B5C, dark teal #0A4F45, teal tint #E4F0EC, sage #CFDDD7 and sage separators #DFE9E5. Coral/amber remain status accents.
- Typography: reference Fraunces headings, IBM Plex Sans interface text and IBM Plex Mono identifiers represented by the existing consistent native font fallbacks. Shared typography tokens maintain the hierarchy without adding font-loading behavior.
- Spacing: 22px screen gutters, 16px cards, 20px tickets, 13px/14px field padding, 12px tile gaps. Existing minimum touch targets remain intact.
- Geometry: 10px fields, 14px cards/tiles/lists, 16px tickets, 12px notes, 26px logo marks, 11px tile icon wells, pill buttons/segments/badges/search and circular avatars/radios/timeline markers.
- Shadows: subtle teal selection halo and small active-segment shadow. The HTML’s device-frame shadow is canvas decoration and is not applied to every app card.
- Ticket decoration: faint 130px circle, matching the rounded reference.
- Chrome: white bottom tabs with teal selected states, native line icons, dark teal display headers, rounded existing custom icon/back controls.

## Shared presentation components

- Updated theme radii, shadows, surfaces, typography and ticket styles.
- Updated ActionButton, BrandMark, PatientPage (fields/cards/notes/loading panels/detail rows), NextAppointmentCard, TicketAccent and NavigationPage.
- Existing InterfaceIcon supplies decorative tab/home icons. No data logic is in the decorative components.

## Screens covered

Splash, welcome, patient home, hospital search, hospital details, book appointment, its existing confirm-appointment step, booking confirmation, booking details, my bookings, create account, priority request, priority status, notifications, profile, staff sign-in, staff registration, priority requests and priority details. Shared styling also covers existing role-selection, sign-in gates and verification/reset/staff placeholder pages. No new screens, routes, fake data or unfinished features were introduced.

Splash, patient home, create account and booking details inherit the rounded shared components even where this pass needed no direct screen edit.

## Files in the complete redesign

### Theme

- `apps/mobile/src/theme/colors.ts`
- `apps/mobile/src/theme/tokens.ts`

### Reusable presentation

- `apps/mobile/src/components/ActionButton.tsx`
- `apps/mobile/src/components/BrandMark.tsx`
- `apps/mobile/src/components/InterfaceIcon.tsx`
- `apps/mobile/src/components/NextAppointmentCard.tsx`
- `apps/mobile/src/components/PatientPage.tsx`
- `apps/mobile/src/components/TicketAccent.tsx`

### Navigation presentation

- `apps/mobile/src/navigation/NavigationPage.tsx`

### Screen presentation

- `apps/mobile/src/screens/BookAppointmentScreen.tsx`
- `apps/mobile/src/screens/BookingConfirmationScreen.tsx`
- `apps/mobile/src/screens/BookingDetailsScreen.tsx`
- `apps/mobile/src/screens/HospitalDetailsScreen.tsx`
- `apps/mobile/src/screens/HospitalSearchScreen.tsx`
- `apps/mobile/src/screens/MyBookingsScreen.tsx`
- `apps/mobile/src/screens/NotificationsScreen.tsx`
- `apps/mobile/src/screens/PatientHomeScreen.tsx`
- `apps/mobile/src/screens/PriorityRequestDetailsScreen.tsx`
- `apps/mobile/src/screens/PriorityRequestsScreen.tsx`
- `apps/mobile/src/screens/ProfileScreen.tsx`
- `apps/mobile/src/screens/RequestPriorityScreen.tsx`
- `apps/mobile/src/screens/RequestStatusScreen.tsx`
- `apps/mobile/src/screens/SplashScreen.tsx`
- `apps/mobile/src/screens/StaffRegistrationScreen.tsx`
- `apps/mobile/src/screens/StaffSignInScreen.tsx`
- `apps/mobile/src/screens/WelcomeScreen.tsx`

Additional documentation: `apps/mobile/UI_REDESIGN.md`.

## Behavior preservation

Business logic, API calls/endpoints, backend/MongoDB, authentication, booking, navigation flow/route names, state management, hook behavior, validation, TypeScript data models and existing functionality are unchanged. Existing props/callbacks, accessibility labels/hints/roles and test IDs are preserved. Loading, retry, refresh, empty and disabled state conditions are unchanged.

A source audit of the 20 presentation files edited in this pass matched existing hooks, state/API/navigation calls, callbacks, accessibility/testID attributes, control behavior props and model declarations against a snapshot taken before editing. Backend files, feature modules, navigator definitions and tests were untouched.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck:mobile` | Passed |
| `npm run lint:mobile` | Passed, no warnings |
| `npm run test:mobile` | Passed: 17 suites, 239 tests |
| Android Expo export | Passed |
| iOS Expo export | Passed |
| `git diff --check` | Passed |

Exports: `/tmp/queuecare-rounded-export-android` and `/tmp/queuecare-rounded-export-ios`. Commands from `apps/mobile`: `npx expo export --platform android --output-dir /tmp/queuecare-rounded-export-android` and the corresponding `--platform ios` command.

## Review limits

Native font fallbacks remain. Urgent buttons retain the stronger existing coral shade for white-label contrast; existing higher-contrast selection/control outlines and readable inactive tab colors are retained. No simulator/device visual review was performed. Successful exports validate bundles, not installed native app execution.
