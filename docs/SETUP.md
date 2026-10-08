# QueueCare local demo setup

Updated 2026-10-07 for D-04/D-08 preparation. Run commands from the repository root containing `package.json`. This guide supports the current Expo Go patient booking demo; a standalone release build and final device acceptance remain separate work.

## 1. Install and configure

Use Node.js 22.13 or newer as required by the workspace manifests, npm, and an Expo Go build compatible with this project's Expo SDK 57. Install the locked dependencies:

```bash
npm ci
```

Create the two local environment files **only if they do not already exist**. These commands preserve existing files:

```bash
if [ ! -e apps/api/.env ]; then cp apps/api/.env.example apps/api/.env; fi
if [ ! -e apps/mobile/.env ]; then cp apps/mobile/.env.example apps/mobile/.env; fi
```

| File | Required configuration |
| --- | --- |
| `apps/api/.env` | `MONGODB_URI` for the intended development database, `MONGODB_DB_NAME`, and a random `JWT_SECRET` of at least 32 bytes. Default `HOST=0.0.0.0` and `PORT=4000` support the LAN demo. Keep JWT issuer/audience consistent with the server. |
| `apps/mobile/.env` | `EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_LAN_IP:4000/api/v1`, replacing the placeholder with the backend computer's current LAN address. This is public app configuration. |

The root `.env` is not a substitute for these workspace files. The API loads `apps/api/.env`; Expo starts in `apps/mobile`. Shell variables can override the base settings, and Expo may also load mode-specific/local environment files. Keep secrets on the API side and out of `EXPO_PUBLIC_*` values.

Generate a JWT secret locally and paste the output into `JWT_SECRET` in the API environment file; retain an existing valid secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Do not put that output in screenshots or the report. Local environment files are ignored by Git; `.env.example` files contain templates only. Changing a server JWT secret invalidates previously issued tokens, so sign in again afterwards.

For MongoDB, use the team's development Atlas database or a local replica set. The template's localhost connection is a starting point, not a command that installs/starts MongoDB. Booking writes require a replica set or sharded deployment; an ordinary standalone server can pass health checks while booking still fails. Follow [local replica-set instructions and booking prerequisites](BOOKING_API.md). Keep certificate verification enabled; see [connection troubleshooting](../apps/api/README.md#troubleshoot-mongodb-connections).

## 2. Check setup and seed fictional sessions

```bash
npm run check:setup
npm run check:db
```

`check:setup` reads the two documented base `.env` files, prints PASS/WARN/FAIL without their values, and exits 1 on a failed configuration check. It does not change files, connect to services, resolve variable interpolation, or evaluate shell/Expo environment overrides. Use literal values in the base files. PASS means the checked settings are present/basic syntax is valid; it does not prove credentials, API reachability, database transaction capability or device connectivity. A Cloudinary warning is compatible with the currently implemented MongoDB photo fallback. `check:db` separately connects and pings the selected database without writes.

For the booking demo, explicitly seed fictional hospitals, services and future sessions into the configured **development** database:

```bash
npm run db:seed:sessions
```

This command writes missing demo records and prints the session date (tomorrow in Asia/Colombo by default). In the app, select that printed date; today's availability may legitimately be empty. To choose a specific day, use `npm run db:seed:sessions -- --date=YYYY-MM-DD` with an actual future date. Existing records/edits are preserved. The seed does not create a patient account or reset booked capacity. Use the app's Create account flow for a fictional patient; no shared hardcoded patient login is supplied.

## 3. Start backend and phone app

Terminal 1:

```bash
npm run dev:api
```

Wait for `QueueCare API listening on 0.0.0.0:4000` (or your configured host/port). In a browser on the computer, open `http://localhost:4000/health`. On the phone, open `http://YOUR_COMPUTER_LAN_IP:4000/health` using the same host as the mobile configuration. Success reports `status: ok` and `database: connected`.

Keep both devices on the same Wi-Fi or shared hotspot. `localhost`/`127.0.0.1` on the phone refers to the phone; `0.0.0.0` is a server bind address, not the URL to put in the app. If the laptop's network address changes, update the mobile environment file.

Terminal 2:

```bash
npm run dev:mobile -- --clear
```

Scan the QR code, reopen the app in Expo Go and keep both terminals running. Restart Expo after changing the API URL; restarting the backend alone does not update the phone's bundled configuration. An Expo tunnel carries the Metro connection, not your separate backend API: the phone must still be able to reach the configured API address.

Create a fictional patient account, then sign in with its **NIC and password**. Session state is in memory; reopening the app may require signing in again. Search for National Hospital of Sri Lanka (NHSL) → select a service → View OPD sessions → choose the seeded date/session → confirm → open saved booking. Then check Home/My Bookings and the booking alert. Record actual results in [the phone checklist](PATIENT_FLOW_TESTING.md); successful startup/sign-in is only part of that checklist.

## 4. Diagnose a failure

| Symptom | Check / action |
| --- | --- |
| “This service is not available yet” on patient sign-in | Run `check:setup`; supply the mobile API URL and restart Expo with `--clear`. Missing/invalid base configuration produces this message in the current patient adapter. |
| “Could not connect” | Confirm the backend is running, the phone can open its LAN `/health`, the URL is current, and the network/firewall allows device-to-computer traffic. Check environment overrides if base-file checks pass. |
| Sign-in gives a generic server failure | Verify `JWT_SECRET` and API startup output. Run `check:db`. Restart the backend after API environment changes; do not print the secret. |
| “NIC or password is incorrect” | Use the NIC/password registered in this configured database. Switching databases does not transfer accounts. Password reset is still a placeholder. |
| “This account is not active” | Ask the account/backend owner to inspect account status; do not bypass authentication or automatically activate a suspended account. |
| No OPD sessions | Check the date printed by the seed, selected service and future session start time. Existing full/closed sessions remain full/closed. |
| Booking returns `BOOKING_UNAVAILABLE` | The database needs transaction support. Follow the replica-set instructions; a green `/health` alone is insufficient. |
| Port 4000 already in use | A backend may already be running. Inspect/reuse that server or stop it in its own terminal; do not start a second copy. If changing ports, update the mobile URL too. |

## 5. Optional media and repeatable checks

For Cloudinary uploads, configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in the API environment and restart the backend. When these are absent/incomplete, photos are saved as files in `apps/api/profile_photo` and MongoDB stores only the link; that is a deviation from the original Cloudinary-only media plan. [Profile/media setup](../apps/api/README.md#profile-photos-cloudinary). Credential presence does not prove upload/delete works; Member 4 owns that final verification.

```bash
npm run test:patient-flow
npm run test:api
npm run test:mobile -- --watchman=false
npm run typecheck:mobile
npm run lint:mobile
```

API integration tests need `mongod` on PATH or `MONGOD_BINARY` and use temporary isolated databases. They do not test the configured Atlas database. The focused setup-check tests run without MongoDB or listeners:

```bash
node --test apps/api/src/tests/checkSetup.test.js
```

Current code implements Member 1 discovery, booking, confirmation, saved reads and booking alerts. Persistent session restoration, cancellation/priority backend integration, staff session editing, remaining queue operations, physical/accessibility/usability acceptance and the installable release build remain pending. This setup guide is prepared for group review; it does not mark final D-04/D-08/A3-19 release acceptance complete.
