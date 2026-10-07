# QueueCare mobile — Expo Go

React Native application for task **S-05**, owned by Member 1. The team selected Expo Go for development on a physical phone.

## Run on your phone

Follow the [complete local setup guide](../../docs/SETUP.md) to configure both workspace environment files, MongoDB, JWT login and the phone's API URL. The API and Expo run in separate terminals from the repository root:

```bash
npm run check:setup
npm run dev:api
```

```bash
npm run dev:mobile -- --clear
```

Use Expo Go compatible with the project's SDK 57, and keep the phone and backend computer on the same network. Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` to the backend's reachable LAN URL ending in `/api/v1`. Restart Expo after URL changes. Android Studio/Xcode are not required for this phone preview workflow; emulator/simulator shortcuts require their platform tools.

Patient registration/sign-in, Home, hospital search/details, session selection, booking confirmation, saved bookings and booking-alert navigation are implemented. Session state is in memory; startup currently returns signed out. Patient sign-in was confirmed on a phone on 2026-10-07; the full [booking and error-recovery checklist](../../docs/PATIENT_FLOW_TESTING.md) remains pending.

## Dependencies and checks

The dependency versions follow the official [SDK 57 TypeScript template](https://github.com/expo/expo/blob/sdk-57/templates/expo-template-blank-typescript/package.json) and [compatible native modules](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json): Expo 57, React Native 0.86.3, React 19.2.3, and safe-area-context 5.7.

Run from the repository root after installation:

```bash
npm run check:mobile
npm run typecheck:mobile
npm run lint:mobile
npm run test:mobile -- --watchman=false
```

The root `package-lock.json` is present. Use `npm ci` for clean installs and keep lockfile updates with dependency changes. For new mobile libraries, run `npx expo install <package>` from `apps/mobile` so Expo selects compatible versions. Native libraries must be available in Expo Go to use this preview workflow.

## Current verification status

The most recent full implementation run (opening hours, 2026-10-06) passed 82 API tests, 291 mobile tests, TypeScript, lint and Android/iOS Metro exports. These are recorded historical results, not native release builds or complete device acceptance. See [test evidence](../../docs/TESTING.md), [accessibility checks](../../docs/ACCESSIBILITY.md), and [setup diagnosis](../../docs/SETUP.md).

## Project layout

- `index.js` uses Expo's `registerRootComponent` to load `src/App.tsx`.
- `app.json` contains the Expo app name, slug, and platform identifiers.
- `metro.config.js` uses `expo/metro-config`, which automatically handles the npm monorepo.
- `src/` retains the feature folders from the project plan. S-12 adds typed root, patient, and staff navigators under `src/navigation/`.
- Native `android/` and `ios/` directories are generated only when preparing a standalone build and are ignored by Git.

The service stack remains Express, MongoDB, JWT, and Cloudinary. Expo Go previews the frontend. The final submission's standalone APK still requires a separate build; see the root README's release instructions and [Expo's local release guide](https://docs.expo.dev/guides/local-app-production/).

## Patient Home API setup

Home now supports next-appointment loading, empty/error states, retry/refresh, hospital search, and booking/alert actions. For real appointment data, configure `apps/mobile/.env` as described in the setup guide and sign in. Home reads the connected authenticated `/bookings/me` endpoint. See [Patient Home integration](../../docs/PATIENT_HOME.md). Guest Home opens without an API connection; hospital results require the configured API and MongoDB. Full phone acceptance remains pending.

## Hospital Search — M1-05

From Home, tap Search hospitals to browse, submit name/city filters, refresh, or load more results. The screen uses `/api/v1/hospitals` without authentication and passes the selected hospital ID to the details route. See [setup and phone verification](../../docs/HOSPITAL_SEARCH.md).

## Hospital Details — M1-07

Tap a hospital to load its information and OPD services. Select one service to enable View OPD sessions. Hospital/service IDs are passed to the next route; guests retain the sign-in gate. Loading, empty, unavailable, failure, retry, and refresh states are implemented. Opening hours and session availability are not invented. See [setup, current limitations, and phone checks](../../docs/HOSPITAL_DETAILS.md). M1-08’s [available sessions API](../../docs/SESSIONS.md) is implemented. M1-09’s [Book Appointment screen](../../docs/BOOK_APPOINTMENT.md) now consumes it with date selection, capacity, single selection, and patient-summary display. M1-10’s [transactional booking API](../../docs/BOOKING_API.md) is implemented; M1-11’s [Confirm Appointment integration](../../docs/CONFIRM_APPOINTMENT.md) now calls it with the validated session token. M1-12’s Booking Confirmation screen, real patient login, booking reads and booking-alert navigation are implemented. Optional stored opening hours are displayed. Physical booking/accessibility acceptance remains pending.
