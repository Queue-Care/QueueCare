# Member 1 — Splash and Welcome

M1-01's in-app Splash UI and startup controller are implemented. M1-02's Welcome screen and its three navigation actions are implemented. Full M1-01 acceptance remains pending real session restoration (S-13), and both screens still need comparison with the missing high-fidelity HTML and phone visual checks.

## Implemented behavior

- On launch, show the branded Splash while the session loader runs.
- A signed-out result opens Welcome. A validated patient session opens patient tabs; a reception/nurse session opens staff tabs.
- Failed or unsupported session results show a friendly recovery message. Try again repeats the check; Continue without signing in opens Welcome with guest browsing available.
- A late result from a replaced loader cannot overwrite the current session.
- Splash is removed from the UI after startup. It is not a route that Back can reopen.
- No artificial splash delay is added. With the current signed-out loader, Splash may be brief.
- Welcome's Get Started and Existing Account actions open role selection with the appropriate intent. Continue as guest opens patient browsing.

## File map

| File under `apps/mobile/src/` | Purpose |
| --- | --- |
| `screens/SplashScreen.tsx` | In-app loading and recovery UI |
| `screens/WelcomeScreen.tsx` | Entry screen and navigation actions |
| `features/startup/useAppStartup.ts` | Asynchronous startup state, retry, validation, and stale-result handling |
| `features/startup/loadStartupSession.ts` | Explicit signed-out default; S-13 integration point |
| `theme/tokens.ts` | README palette, spacing, radii, and system-font fallbacks |
| `components/BrandMark.tsx` | Decorative code-drawn brand mark |
| `components/ActionButton.tsx` | Accessible entry-screen buttons |

## Authentication handoff — Member 2

`loadStartupSession` currently returns `null`. This is intentional: there is no authentication implementation or saved session in this checkout. The startup controller is implemented, but it does not yet read credentials, validate a JWT with the backend, or perform login.

Replace this loader with the authentication provider's session-restoration operation. It should resolve `null` for no/expired credentials, resolve `{ userId, role }` only after authentication validation, and reject on recoverable storage/network failures. Supported roles are PATIENT, RECEPTION, and NURSE. Basic shape/role checking in the startup controller is not authentication or server authorization.

Tests inject a loader through the `App` component's `loadSession` prop. This is a code integration seam, not a user-facing role switch. When S-13 adds live sign-in/sign-out state, connect that provider to `AppNavigator` so navigation updates after authentication changes as well as on launch.

## Design handoff — Member 4

The entire color palette from README section 12 is centralized in `theme/tokens.ts`. Navigation and entry screens now share it. Display and body fonts use the README's permitted system fallback. The small action button and brand mark support these screens; the rest of S-10/S-11's shared design system remains pending.

The high-fidelity HTML has not been provided in the repository. Layout, wording, and the brand mark are an interim interpretation of the README, not a verified reproduction of that prototype. Reconcile these details when the prototype is available. Both screens support safe areas, scrolling, font scaling, and a capped content width. Buttons have at least 48-point touch targets, and decorative mark elements are hidden from accessibility tools.

This is an in-app Splash rendered after JavaScript starts. It does not configure or replace Expo Go's own native launch screen.

## Validation and phone check

TypeScript, ESLint, all 19 automated tests, and Android/iOS Metro exports pass. Tests cover startup loading, null/patient/staff sessions, synchronous and asynchronous failures, retry, signed-out recovery, unsupported roles, stale loader results, and the existing navigation flows.

From the repository root:

```bash
npm run dev:mobile -- --clear
```

Open QueueCare in Expo Go and check Welcome on a small screen and with larger system text. Try all three actions and return with Back. When real session restoration is connected, repeat startup with signed-out, patient, staff, expired, and offline sessions. Save screenshots under `docs/milestone03/evidence/` and compare the screens with the high-fidelity prototype before marking visual acceptance complete.
