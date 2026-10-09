# QueueCare: complete guide from GitHub to a running app

This guide is for someone who has never worked on QueueCare. The project already contains a React Native mobile app built with Expo and a Node.js/Express API backed by MongoDB. You do not need to create a new project.

Commands run from the **repository root** unless a section explicitly changes directory. The root is the `QueueCare` folder containing `package.json`, `package-lock.json`, and `apps/`.

## Contents

1. [Choose how to run](#1-choose-how-to-run)
2. [Install the tools](#2-install-the-tools)
3. [Download the source from GitHub](#3-download-the-source-from-github)
4. [Run the mobile app with the deployed backend](#4-run-the-mobile-app-with-the-deployed-backend)
5. [Run your own backend and database](#5-run-your-own-backend-and-database)
6. [Connect your phone to your local backend](#6-connect-your-phone-to-your-local-backend)
7. [Try the patient and staff journeys](#7-try-the-patient-and-staff-journeys)
8. [Other ways to open the app](#8-other-ways-to-open-the-app)
9. [Stop, restart, and update](#9-stop-restart-and-update)
10. [Run checks and tests](#10-run-checks-and-tests)
11. [Install or build a release APK](#11-install-or-build-a-release-apk)
12. [Troubleshooting](#12-troubleshooting)
13. [Project map and handoff checklist](#13-project-map-and-handoff-checklist)

## 1. Choose how to run

| Goal | What you need | Start here |
| --- | --- | --- |
| Try the app on Android without source code | The release APK and internet access | Section 11A |
| Run/edit the mobile app using the team's deployed API | Git, Node.js/npm, compatible Expo Go, internet access | Sections 2–4 |
| Develop both frontend and backend independently | All of the above, plus your own MongoDB database and backend environment | Sections 2–7 |
| Generate your own standalone Android APK | Source code, an Expo account for EAS, or Android build tools for a local build | Section 11B/C |

The currently configured deployed backend is:

```text
https://queue-care-sable.vercel.app
```

The mobile application's API base includes `/api/v1`:

```text
https://queue-care-sable.vercel.app/api/v1
```

The deployed service is operated by the project owner. Its availability and data may change. A new clone does not deploy another backend automatically. Use fictional information when trying a shared demo; registrations and bookings are saved in its database.

## 2. Install the tools

1. Install [Git](https://git-scm.com/downloads).
2. Install [Node.js](https://nodejs.org/en/download). The workspace requires **Node.js 22.13.0 or newer**; npm is included with Node.js.
3. Optionally install [Visual Studio Code](https://code.visualstudio.com/) to edit the files.
4. For phone development, install **Expo Go compatible with Expo SDK 57**, which is the version used by this repository. See [Expo's device setup guide](https://docs.expo.dev/get-started/set-up-your-environment/) and [Expo Go downloads](https://expo.dev/go). If the installed Expo Go reports an unsupported SDK, use a matching Android version rather than changing the project's dependencies blindly.

Open a new terminal after installing tools. On Windows, use PowerShell; on macOS/Linux, use Terminal.

```sh
git --version
node --version
npm --version
```

Each command should print a version. If a command is not recognized, reopen the terminal and check that the tool was added to PATH. Android Studio is unnecessary for Expo Go on a real phone, but needed for the emulator/local native build options below.

## 3. Download the source from GitHub

Use a short folder path, especially on Windows, to avoid native build path limits. For example, open a terminal in `C:\Projects` after creating that folder.

```sh
git clone https://github.com/Queue-Care/QueueCare.git
cd QueueCare
git fetch origin
git switch develop
npm ci
```

`npm ci` installs the versions in `package-lock.json`. Run it at the root so npm installs all workspace dependencies together. Do not create separate projects inside `apps/mobile` or `apps/api`.

If the repository is private, sign in to GitHub with an account that has access. Ask the repository owner for access if cloning is denied.

### Selecting the correct branch

`develop` is the team's integration branch. At the time this guide was written, the APK configuration and this guide were being prepared on `patient_signup-priority_request`. If they have not yet been merged into `develop`, use that branch to get those files:

```sh
git switch patient_signup-priority_request
npm ci
```

This command only works once the branch and required commits have been pushed to GitHub. Uncommitted files on someone else's laptop are not included in a clone. Ask the owner which branch contains the intended demo version.

Confirm your location and branch:

```sh
git branch --show-current
```

In VS Code, use **File → Open Folder → QueueCare**. Open its integrated terminal. Do not run project commands from `C:\Windows\System32`.

## 4. Run the mobile app with the deployed backend

This is the shortest source-code setup. You do not need a backend `.env`, MongoDB installation, JWT secret, or a running local API for this path.

### A. Create the mobile environment file

From the repository root, copy the example only if the file does not exist.

**Windows PowerShell:**

```powershell
if (-not (Test-Path apps/mobile/.env)) {
  Copy-Item apps/mobile/.env.example apps/mobile/.env
}
```

**macOS/Linux:**

```sh
if [ ! -f apps/mobile/.env ]; then cp apps/mobile/.env.example apps/mobile/.env; fi
```

Open `apps/mobile/.env` and set:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://queue-care-sable.vercel.app/api/v1
```

This is a public address, not a secret. Never place MongoDB passwords, `JWT_SECRET`, or Cloudinary API secrets in this file. A root-level `.env` does not replace `apps/mobile/.env`.

### B. Check the backend

Open these addresses in a browser:

- [Backend health](https://queue-care-sable.vercel.app/health): should return JSON showing `status: ok` and `database: connected`.
- [Hospital API](https://queue-care-sable.vercel.app/api/v1/hospitals): should return JSON hospital data.

If these fail, the backend owner must investigate deployment/database availability, or use your own backend in section 5. `/health` is at the server root; `/api/v1/health` is not the documented health route.

### C. Start Expo

At the repository root:

```sh
npm run dev:mobile -- --clear
```

Keep this terminal open. Connect the phone and laptop to the same Wi-Fi, open Expo Go, and scan the terminal QR code on Android. Wait for the bundle to load.

If the phone cannot reach Expo over the network, stop Expo with **Ctrl+C**, then try:

```sh
npm run dev:mobile -- --tunnel --clear
```

Tunnel mode needs internet access and may prompt to install its tunneling dependency. Scan the **new** QR code. The tunnel transports Expo's development bundle; API requests still use the HTTPS Vercel address configured above.

**Success:** QueueCare opens and hospital discovery works. Continue with section 7.

## 5. Run your own backend and database

Choose this path when editing backend code or using an isolated database. Accounts/data in this database are separate from the deployed backend unless you deliberately use the same database. Prefer your own development database.

### A. Obtain a MongoDB connection

Two options are supported:

- **MongoDB Atlas:** follow [MongoDB's getting-started guide](https://www.mongodb.com/docs/get-started/) to create a cluster, create a database user, allow your computer's public IP in network access, and obtain the application connection string. The database user is separate from your Atlas website login. Replace the connection string's password placeholder with the database user's password; special characters in credentials must be URL-encoded.
- **Existing team development database:** obtain the authorized connection string and database name privately from the team member who manages it. Do not post it in GitHub, screenshots, chat logs, or this guide.

Appointment/priority writes use transactions. **Atlas or a MongoDB replica set is required.** A plain standalone local MongoDB can pass the connection check yet fail bookings.

You do not need to install local MongoDB to run the app against Atlas. Local integration tests are a separate case (section 10).

### B. Create `apps/api/.env`

**Windows PowerShell:**

```powershell
if (-not (Test-Path apps/api/.env)) {
  Copy-Item apps/api/.env.example apps/api/.env
}
```

**macOS/Linux:**

```sh
if [ ! -f apps/api/.env ]; then cp apps/api/.env.example apps/api/.env; fi
```

Edit the copied file. This example contains placeholders you must replace:

```dotenv
HOST=0.0.0.0
PORT=4000
MONGODB_URI=mongodb+srv://YOUR_DB_USER:YOUR_ENCODED_PASSWORD@YOUR_CLUSTER_HOST/?retryWrites=true&w=majority
MONGODB_DB_NAME=queuecare_dev
JWT_SECRET=PASTE_YOUR_GENERATED_SECRET_HERE
JWT_ISSUER=queuecare-api
JWT_AUDIENCE=queuecare-mobile
```

Use the URI provided by Atlas, not the literal example. Match `MONGODB_DB_NAME` to the development database you intend to use. The repository's template defaults to `opd_queue`; this guide uses `queuecare_dev` as an example of a separate development database.

Generate a secret on your computer:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Paste the resulting value into `JWT_SECRET`. Keep it private. Retain a valid existing secret when reusing a team environment; changing it invalidates existing login tokens.

Backend variables belong in **`apps/api/.env`**, not the root `.env` or mobile `.env`. Existing shell environment variables can override file values.

### C. Check the connection and start the API

```sh
npm run check:db
npm run dev:api
```

The connection check should report that MongoDB connection and ping succeeded, with the selected database name. Wait for the API's listening message. Keep this terminal open.

On the laptop, open:

```text
http://localhost:4000/health
http://localhost:4000/api/v1/hospitals
```

If your `PORT` is different, replace `4000` in every URL. The default in the checked-in example is **4000**, even if a teammate previously used 5000.

### D. Add development demo data, if needed

In a second terminal at the root:

```sh
npm run db:seed:sessions
```

This writes demo hospitals, services, and future sessions to the database selected in your API environment. Use a development database you are allowed to modify. It prints the session date, normally tomorrow in Asia/Colombo. Choose that date in the app. It does not create a patient or staff login.

To choose a specific future date, replace the example date with an actual future day:

```sh
npm run db:seed:sessions -- --date=2027-01-15
```

For only hospitals/services, the available commands are:

```sh
npm run db:seed:hospitals
npm run db:seed:discovery
```

These seeds preserve existing edits. Starting the API does not seed data automatically. You can also create sessions through a hospital-linked staff account in the app.

### E. Optional: local MongoDB replica set

If you prefer local MongoDB, install MongoDB Community Server (`mongod`) and MongoDB Shell (`mongosh`). Use a separate directory/port so existing databases remain untouched.

**Windows PowerShell, terminal 1:**

```powershell
New-Item -ItemType Directory -Path "$env:LOCALAPPDATA\QueueCare\mongo-dev" -Force
mongod --dbpath "$env:LOCALAPPDATA\QueueCare\mongo-dev" --replSet queuecareDev --bind_ip 127.0.0.1 --port 27018
```

**macOS/Linux, terminal 1:**

```sh
mkdir -p "$HOME/queuecare-mongo-dev"
mongod --dbpath "$HOME/queuecare-mongo-dev" --replSet queuecareDev --bind_ip 127.0.0.1 --port 27018
```

Keep that process running. In another terminal, initialize the replica set **once**:

```sh
mongosh "mongodb://127.0.0.1:27018/?directConnection=true" --eval 'rs.initiate()'
```

Wait for a primary, then set these in `apps/api/.env`:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27018/queuecare_dev?replicaSet=queuecareDev
MONGODB_DB_NAME=queuecare_dev
```

Keep the JWT settings too. Run `npm run check:db`, seed if necessary, and start the API. The phone communicates with Express; do not expose MongoDB directly to the phone.

### F. Optional profile image storage

For durable hosted profile images, set these **backend-only** values from your Cloudinary account:

```dotenv
CLOUDINARY_CLOUD_NAME=YOUR_CLOUD_NAME
CLOUDINARY_API_KEY=YOUR_API_KEY
CLOUDINARY_API_SECRET=YOUR_API_SECRET
```

Restart the API after changing them. Without Cloudinary, the current backend uses files under `apps/api/profile_photo`; photos then belong to that API machine. Do not rely on this local file fallback as persistent storage on a serverless host. See [the API media notes](apps/api/README.md#profile-photos-cloudinary).

## 6. Connect your phone to your local backend

Skip this section when using the deployed HTTPS backend.

### A. Find the laptop's network address

Connect laptop and phone to the same non-guest Wi-Fi. On Windows:

```powershell
ipconfig
```

Read the **IPv4 Address under the active Wi-Fi adapter**. For example, if it is `192.168.1.20`, set `apps/mobile/.env` to:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:4000/api/v1
```

Replace the example IP with your own. Do not use the router gateway (often `192.168.1.1`), an inactive/VMware adapter, `localhost`, or `0.0.0.0`. If the phone is connected to a laptop hotspot, use the laptop's active hotspot adapter address instead; it may differ from the Wi-Fi address.

### B. Test from the phone before opening the app

Open this address in the **phone's browser**, using your laptop's IP:

```text
http://192.168.1.20:4000/health
```

It must return the API health JSON. If it times out, fix the network/firewall/API listener first. An Expo QR code loading successfully does not prove the separate backend is reachable.

On Windows, if the trusted home Wi-Fi is classified as Private, an administrator can add a rule limited to that profile and local subnet:

```powershell
New-NetFirewallRule -DisplayName "QueueCare API development" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -RemoteAddress LocalSubnet -Profile Private
```

Use the actual API port. Check the active network profile before adding a rule:

```powershell
Get-NetConnectionProfile
```

A rule for Private does not apply to a Public-profile connection. Avoid disabling the whole firewall. Guest Wi-Fi/client isolation, VPNs, and hotspot adapter conflicts can prevent device-to-laptop access even on apparently shared Wi-Fi. If LAN access remains blocked, use the deployed backend in section 4.

### C. Start or restart Expo

In a second terminal at the root:

```sh
npm run dev:mobile -- --clear
```

Scan the current QR code. Restart Expo whenever you change the mobile environment file. Expo tunnel mode only tunnels Metro; it does not make a local API public.

## 7. Try the patient and staff journeys

Use fictional records and accounts created in the same backend you have configured. No universal demo username/password is provided in the repository.

### Patient

1. Open QueueCare and choose patient registration.
2. Complete the required fields, including password confirmation.
3. After registration, sign in with the registered **NIC and password**.
4. On Patient Home, search for a hospital and select a service.
5. View OPD sessions and choose a date with a future open session. If using seeds, select the date printed in section 5D.
6. Choose a session, book, and check the saved confirmation, Home, and My Bookings.
7. Submit a priority request for the booking. Reception reviews it; submission alone does not mean acceptance.
8. Check Request Status and notifications for the reception decision.

### Hospital staff

1. Register a staff account and select the correct hospital record from the available hospitals.
2. Sign in with **Staff ID and password**.
3. Open the dashboard/session management and add an appropriate future session for a service at that hospital.
4. From a patient account, select that hospital, service, and date to find the session.
5. Submit a patient priority request, then review it from staff at the **same hospital**. Staff at another hospital should not receive that request's hospital-scoped notifications/inbox entries.
6. Accept or decline, then check the patient's status/notification. Acceptance assigns a reserved priority slot when available.
7. Exercise check-in and queue actions using the relevant screens and test records.

Use a hospital-linked staff account. A manually typed hospital name that does not match a hospital record can leave an account without a valid hospital link and cause staff operations to be rejected.

Treat successful startup as the first check, not proof that every authenticated feature works. See [API contracts](docs/API.md) for endpoint details.

## 8. Other ways to open the app

### Laptop browser

At the repository root:

```sh
npm run dev:mobile -- --web --clear
```

Open the browser address printed by Expo. This starts the frontend; the API must still be reachable through the configured URL. Native Android behavior and camera/media flows should be tested on Android. When using a local backend in a browser on the same laptop, the base can be `http://localhost:4000/api/v1`; switch back to a phone-reachable address before phone testing.

### Android emulator

Install Android Studio, create/start an Android Virtual Device, then run from the root:

```sh
npm run android:mobile
```

For the Android Studio emulator to reach a backend running on the host laptop, use:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000/api/v1
```

That special host address is for the emulator, not a physical phone. The deployed HTTPS backend works for both.

## 9. Stop, restart, and update

**Stop:** press **Ctrl+C** in each running terminal. Stop the API, Expo, and local `mongod` separately when finished.

**Restart the local backend**, at the root:

```sh
npm run dev:api
```

**Restart the mobile frontend**, in another root terminal:

```sh
npm run dev:mobile -- --clear
```

Keep both running for local development. When using the deployed backend, only Expo runs on your laptop. Backend `.env` changes require restarting the API; mobile `.env` changes require restarting Expo. Release APK environment changes require building and reinstalling a new APK.

### Get newer GitHub changes

First inspect your work:

```sh
git status
```

Save your changes with a commit or stash before updating. For a clean `develop` checkout:

```sh
git switch develop
git pull --ff-only origin develop
npm ci
```

To bring `develop` into your feature branch, switch to your actual feature branch first, then:

```sh
git fetch origin
git merge origin/develop
```

Resolve any reported conflicts deliberately, preserving both intended features, and rerun checks. Do not delete conflict sections blindly or reset local work to force an update. Environment files, private signing keys, and ignored APKs are not transferred by Git.

## 10. Run checks and tests

From the root:

```sh
npm run check:mobile
npm run typecheck:mobile
npm run lint:mobile
npm run test:mobile -- --watchman=false
```

`check:mobile` checks dependency compatibility; it does not prove phone connectivity. For a complete **local** setup with both environment files:

```sh
npm run check:setup
npm run check:db
```

`check:setup` expects a backend environment file too. It is not required for the deployed-backend-only path in section 4. `check:db` pings MongoDB but does not establish that all booking transactions work.

Backend tests:

```sh
npm run test:api
npm run test:patient-flow
npm run test:staff-patient-flow
```

MongoDB integration tests launch temporary isolated local databases. They require **`mongod` on PATH** or its executable path in `MONGOD_BINARY`; they do not use your Atlas connection simply because `check:db` passes.

Windows example (replace the installed version/path):

```powershell
$env:MONGOD_BINARY = 'C:\Program Files\MongoDB\Server\YOUR_VERSION\bin\mongod.exe'
npm run test:api
```

macOS/Linux example:

```sh
MONGOD_BINARY=/actual/path/to/mongod npm run test:api
```

If local MongoDB is not installed, this blocks those integration tests, not mobile use of a reachable Atlas-backed API. One available configuration test can run without MongoDB:

```sh
node --test apps/api/src/tests/checkSetup.test.js
```

Build verification on 2026-10-09 recorded TypeScript passing, 498 mobile tests passing with 3 existing `g_StaffMember4` failures, and 6 focused backend tests passing. These are historical results, not a guarantee for your checkout. Read current output and report failures honestly.

## 11. Install or build a release APK

### A. Install an APK supplied by the owner

The generated APK on the build machine is `artifacts/QueueCare-release.apk` (Android 7.0+). This folder is **Git-ignored**, so a fresh clone will not contain the APK. Obtain it separately from the owner or a published release/build artifact. No public GitHub APK download has been established by this guide.

1. Download or transfer the APK to your Android phone using USB or a file-sharing service.
2. Open it in the phone's file manager.
3. Allow that file manager/browser to install unknown applications if Android prompts.
4. Tap **Install**, then open QueueCare.
5. Keep internet access enabled for the deployed backend.

The release contains the app bundle and does not require Expo Go, a QR code, Metro, or the developer's laptop. A chat link to a `C:\...` path is a local laptop file link, not an internet download URL.

If updating an existing standalone installation, use an APK signed with the same key. A differently signed APK cannot update it. Ask the owner for the correct signed build before removing an installation.

### B. EAS cloud build from a fresh clone

The release branch contains `apps/mobile/eas.json` with profile `release-apk`, APK output, and the deployed HTTPS API URL. Check that file exists before starting. Work in the mobile workspace:

```sh
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure --platform android
npx eas-cli@latest build --platform android --profile release-apk
```

Sign in to your authorized Expo account. Follow prompts to link/create the **EAS project for this existing application**. Do not run a new React Native project generator. Ensure configuration preserves the `release-apk` profile. EAS service limits/queues apply to your account.

For a new independent installation, EAS can manage a new Android signing key. For updates to the team's existing APK, the owner must supply/import the existing key securely; do not create a different key. Keep passwords out of source files and chat. See [Expo's APK build/install documentation](https://docs.expo.dev/build-reference/apk/).

Wait for an actual successful build. EAS provides a build-details page and artifact download link; open the APK link on the phone. An AAB is a Play Store upload format, not the directly installable APK requested here.

Return to the root afterwards:

```sh
cd ../..
```

### C. Local Windows release build

See [ANDROID_RELEASE.md](docs/ANDROID_RELEASE.md) for the verified local Expo-prebuild/Gradle workflow and SDK versions. Local building requires Android SDK/build tools, JDK 17, and private signing credentials.

The scripts expect `.release-signing/queuecare-release.jks` and `.release-signing/credentials.json` on the build machine. These are intentionally not on GitHub. Ask the owner to provision signing securely, or use the EAS route for your own build. Do not hardcode signing passwords or assume a fresh clone has those files.

After an authorized local build, run the included verification script. It checks the APK signature, package, non-debuggable manifest, embedded bundle, and Vercel API URL. Install on a real Android device and exercise the journeys in section 7; build success alone is not end-to-end acceptance.

## 12. Troubleshooting

| Problem | What to do |
| --- | --- |
| `npm`/`git` is not recognized | Install the corresponding tool, reopen the terminal, and check PATH. |
| `npm.ps1 cannot be loaded` in PowerShell | Use `npm.cmd` instead of `npm`, or use Command Prompt with the equivalent npm commands. |
| `ENOENT` for `package.json` | Change directory to the cloned `QueueCare` root. |
| `npm ci` fails downloading packages | Check internet/proxy access to npm and GitHub. Read the first error; do not delete the lockfile to hide it. |
| Expo SDK mismatch | Use Expo Go compatible with SDK 57 or a suitable development/release build. |
| `Unable to resolve ../../App` | Start Expo through the root scripts or from `apps/mobile`. Confirm `apps/mobile/package.json` points to `index.js`; restart with `--clear`. Do not create a second app at the root. |
| Expo: failed to download remote update / cannot connect to CLI | Keep the Expo terminal running, scan its latest QR code, check Wi-Fi, and try `--tunnel --clear`. The CLI connection and backend connection are separate. |
| `packager-status:running` | Expo/Metro is reachable. It does not confirm Express or MongoDB is working. The API check is `/health` on the API port or Vercel domain. |
| App says service unavailable | Check `apps/mobile/.env`, include `/api/v1`, and restart Expo. Check for other `.env.local`/mode-specific files or shell values overriding it. |
| App says could not connect | Open the API `/health` in the phone browser. For LAN, check IP, API listener, firewall, and network isolation. For Vercel, check service availability. |
| JWT secret startup error | Put a generated random secret in `apps/api/.env`. If an old shell value overrides it, Windows: `Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue`; macOS/Linux: `unset JWT_SECRET`. Restart and sign in again if the secret changed. |
| API port already in use | Stop the previous API in its own terminal or reuse it after checking health. If choosing a different port, update the mobile base URL too. |
| Expo port 8081 already in use | Stop the earlier Expo terminal with Ctrl+C before restarting on 8081, or accept another port and scan its new QR code. Do not kill unrelated processes blindly. |
| `check:db` fails | Check URI, database user's credentials/permissions, Atlas network access, and cluster status. Keep TLS verification enabled. |
| Booking fails although health succeeds | Check transaction support: use Atlas or a replica set. Check session availability and the API terminal's error. |
| No upcoming sessions | Match the hospital/service/date; use the seeded date or staff-created session date. Sessions must be open, in the future, and have remaining capacity. |
| Hospital-linked staff account required | Use an account linked to an actual hospital record; ask the backend owner to inspect a previously unlinked account. |
| Priority request not shown to staff | Confirm patient booking and staff account belong to the same hospital, and refresh the pending inbox. Another hospital should not see it. |
| Login fails after switching API/database | Register/use an account in that database. Accounts are not copied automatically between local and hosted backends. |
| `mongod` missing during tests | Install local MongoDB Server or set `MONGOD_BINARY`. Atlas application connectivity does not provide a local test executable. |
| Native build filename longer than 260 characters | Use a short project path and the short-path workflow in `docs/ANDROID_RELEASE.md`. |
| APK link does nothing | Locate the actual file or use a hosted APK artifact link. Local filesystem paths are not public download links. |

For support, share the exact command, sanitized error text, selected branch, Node version, and whether you use local or deployed API. Never share `.env` contents, tokens, passwords, or signing credentials.

## 13. Project map and handoff checklist

| Path | Purpose |
| --- | --- |
| `package.json` | Root workspace scripts; run the main commands here |
| `apps/mobile/` | Expo/React Native frontend |
| `apps/mobile/app.json` | Expo app/platform/package configuration |
| `apps/mobile/.env.example` | Public mobile configuration template |
| `apps/mobile/eas.json` | Release APK cloud-build profile, when included in your branch |
| `apps/api/` | Node.js/Express backend |
| `apps/api/.env.example` | Backend configuration template |
| `apps/api/src/server.js` | API startup and database setup |
| `packages/shared/` | Shared workspace code |
| `docs/API.md` | API contracts |
| `docs/ANDROID_RELEASE.md` | Local release signing/build details |
| `scripts/build-android-release.ps1` | Authorized local Windows APK build |
| `scripts/verify-android-release.ps1` | Generated APK verification |
| `artifacts/` | Local APK/output files; not transferred by Git |

Before handing the project to another person:

- Push the intended source/configuration/documentation commits and name the branch to clone.
- Provide either a working shared API address or authorized private development environment details.
- Supply the release APK separately if they only need to install the app.
- Provide a future demo session date and explain how to create patient/staff test accounts.
- Confirm the phone can reach the API and run a patient booking plus same-hospital staff priority review.
- Keep MongoDB/JWT/Cloudinary/signing secrets out of Git and public handoff files.
