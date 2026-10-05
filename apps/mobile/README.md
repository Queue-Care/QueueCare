# QueueCare mobile — Expo Go

React Native application for task **S-05**, owned by Member 1. The team selected Expo Go for development on a physical phone.

## Run on your phone

1. Install Node.js 22.13 or newer (a supported LTS release) and npm on your computer.
2. Install an [Expo Go build compatible with SDK 57](https://expo.dev/go) on your phone.
3. Connect your computer and phone to the same Wi-Fi network.
4. From the repository root, run:

```bash
npm install
npm run dev:mobile
```

Scan the terminal QR code using Expo Go on Android or the Camera app on iOS. Keep the terminal running. Startup shows the in-app Splash while resolving the session, then Welcome offers Get Started, Existing Account, and Continue as guest. Welcome, Patient Home, Hospital Search, and Hospital Details have dedicated layouts. Session selection and booking still have navigation scaffolds. The default session loader is signed out until S-13 authentication is connected. Android Studio, Xcode, and USB debugging are not required for this phone workflow.

If the phone cannot connect, check that the network allows devices to communicate and that your firewall allows the Expo development server. Use a shared personal hotspot if your campus network isolates devices.

After changing Expo or Metro configuration, clear the cache with:

```bash
npm run dev:mobile -- --clear
```

`npm run android:mobile` and `npm run ios:mobile` are optional shortcuts for opening Expo Go on an installed Android emulator or iOS simulator. These shortcuts require their platform tools.

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

Dependencies are installed and the user confirmed QueueCare opens in Expo Go (S-05). The S-12 navigation scaffold passes TypeScript, lint, automated tests, and Android/iOS Metro exports. Expo’s offline compatibility check reports dependencies up to date against its bundled metadata. Splash, Welcome, and startup recovery pass the expanded 19-test suite. Prototype comparison and phone visual testing remain pending; follow [the startup handoff](../../docs/STARTUP.md) and [navigation checks](../../docs/NAVIGATION.md).

## Project layout

- `index.js` uses Expo's `registerRootComponent` to load `src/App.tsx`.
- `app.json` contains the Expo app name, slug, and platform identifiers.
- `metro.config.js` uses `expo/metro-config`, which automatically handles the npm monorepo.
- `src/` retains the feature folders from the project plan. S-12 adds typed root, patient, and staff navigators under `src/navigation/`.
- Native `android/` and `ios/` directories are generated only when preparing a standalone build and are ignored by Git.

The service stack remains Express, MongoDB, JWT, and Cloudinary. Expo Go previews the frontend. The final submission's standalone APK still requires a separate build; see the root README's release instructions and [Expo's local release guide](https://docs.expo.dev/guides/local-app-production/).

## Patient Home API setup

Home now supports next-appointment loading, empty/error states, retry/refresh, hospital search, and booking/alert actions. For real appointment data, copy `.env.example` to `.env` in `apps/mobile` and configure the public API URL, then connect the real authentication provider and booking-list backend. See [Patient Home integration](../../docs/PATIENT_HOME.md). Guest Home opens without an API connection; hospital results require the configured API and MongoDB. Live booking data and phone acceptance remain pending.

## Hospital Search — M1-05

From Home, tap Search hospitals to browse, submit name/city filters, refresh, or load more results. The screen uses `/api/v1/hospitals` without authentication and passes the selected hospital ID to the details route. See [setup and phone verification](../../docs/HOSPITAL_SEARCH.md).

## Hospital Details — M1-07

Tap a hospital to load its information and OPD services. Select one service to enable View OPD sessions. Hospital/service IDs are passed to the next route; guests retain the sign-in gate. Loading, empty, unavailable, failure, retry, and refresh states are implemented. Opening hours and session availability are not invented. See [setup, current limitations, and phone checks](../../docs/HOSPITAL_DETAILS.md). M1-08’s [available sessions API](../../docs/SESSIONS.md) is implemented. M1-09’s [Book Appointment screen](../../docs/BOOK_APPOINTMENT.md) now consumes it with date selection, capacity, single selection, and patient-summary display. M1-10’s [transactional booking API](../../docs/BOOKING_API.md) is implemented; M1-11’s [Confirm Appointment integration](../../docs/CONFIRM_APPOINTMENT.md) now calls it with the validated session token. Next is M1-12’s full Booking Confirmation screen. Real login/profile loading, booking reads, and phone acceptance remain pending.
