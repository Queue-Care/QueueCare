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

Scan the terminal QR code using Expo Go on Android or the Camera app on iOS. Keep the terminal running. The initial screen displays QueueCare; it is a startup scaffold, not the assessed Splash or Welcome flow. Android Studio, Xcode, and USB debugging are not required for this phone workflow.

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

Commit the root `package-lock.json` after a successful install. Use `npm ci` for subsequent clean installs once that lockfile exists. For new mobile libraries, run `npx expo install <package>` from `apps/mobile` so Expo selects compatible versions. Native libraries must be available in Expo Go to use this preview workflow.

## Current verification status

The configuration has been migrated from the previous React Native CLI scaffold. npm downloads still fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` on the setup network, which presents a Fortinet certificate. Use a working network or a trusted CA certificate supplied by your network administrator through `NODE_EXTRA_CA_CERTS`; keep TLS verification enabled.

Dependency installation, Expo's dependency check, TypeScript, lint, tests, and a phone launch remain pending. No lockfile or successful device run is claimed. Record a screenshot under `docs/milestone03/evidence/` after launching QueueCare before marking S-05 complete.

## Project layout

- `index.js` uses Expo's `registerRootComponent` to load `src/App.tsx`.
- `app.json` contains the Expo app name, slug, and platform identifiers.
- `metro.config.js` uses `expo/metro-config`, which automatically handles the npm monorepo.
- `src/` retains the feature folders from the project plan. S-12 will add React Navigation.
- Native `android/` and `ios/` directories are generated only when preparing a standalone build and are ignored by Git.

The service stack remains Express, MongoDB, JWT, and Cloudinary. Expo Go previews the frontend. The final submission's standalone APK still requires a separate build; see the root README's release instructions and [Expo's local release guide](https://docs.expo.dev/guides/local-app-production/).
