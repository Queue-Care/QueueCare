# QueueCare API

The API supports hospital discovery, session availability, patient booking summaries, staff account registration/sign-in, the reception dashboard, staff priority-request decisions, in-app notifications, and profile updates. Staff registration stores the staff profile in MongoDB's `users` collection, hashes passwords with Node scrypt, and issues a 24-hour JWT after Staff ID/password sign-in. Staff accounts created through this endpoint are active immediately. Patient registration/login, booking creation and owned booking-list/detail APIs are implemented. Booking edits and staff session writes remain pending. See the [complete local setup guide](../../docs/SETUP.md).

## Staff accounts

The mobile staff registration form calls `POST /api/v1/staff/auth/register`; staff sign-in calls `POST /api/v1/staff/auth/sign-in`. Registration requires a unique Staff ID and work email, and accepts Reception or Nurse. The current mobile registration creates Reception accounts. Passwords are never returned or stored in plain text. A successful sign-in returns a JWT and the profile used to open the Reception Desk.

Example registration body:

```json
{
  "fullName": "Asha Perera",
  "staffId": "CNH-RC-0421",
  "hospital": "Colombo National Hospital",
  "role": "RECEPTION",
  "mobile": "+94 71 234 5678",
  "email": "asha@example.org",
  "password": "change-this-password"
}
```

Staff accounts become active on registration so they can sign in immediately. Keep the API's `JWT_SECRET` private and configure `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` for the device running Expo.

Registration links the account to a hospital record: the mobile form sends the `hospitalId` picked from `GET /api/v1/hospitals`, and a typed `hospital` name is matched case-insensitively. A linked account only sees its own hospital's sessions and priority requests. A name that matches no hospital record is stored as text and the account is left unlinked, in which case staff views are not filtered by hospital.

## Member 4 — priority requests, notifications, and profile

All routes below require `Authorization: Bearer <JWT>` from staff sign-in. Staff routes accept Reception, Nurse, or Admin accounts and return `403 FORBIDDEN` to patients.

| Method | Endpoint | Operation |
|---|---|---|
| GET | `/api/v1/staff/dashboard` | **Read** today's sessions, priority waiting, checked-in count, now serving, unread notifications |
| GET | `/api/v1/staff/priority-requests?status=pending\|decided` | **Read** the hospital-scoped inbox; `meta.pendingCount` drives the tab badge |
| GET | `/api/v1/staff/priority-requests/:requestId` | **Read** patient (masked NIC), booking, session, and reason |
| PATCH | `/api/v1/staff/priority-requests/:requestId/decision` | **Update** with `{ "decision": "ACCEPTED" \| "DECLINED", "decisionNote"?: string }` |
| GET | `/api/v1/notifications` | **Read** the signed-in user's notifications; `meta.unreadCount` |
| PATCH | `/api/v1/notifications/:id/read` | **Update** one notification as read |
| PATCH | `/api/v1/notifications/read-all` | **Update** all as read |
| DELETE | `/api/v1/notifications/:id` | **Delete** one of the user's own notifications |
| GET | `/api/v1/me` | **Read** the current profile |
| PATCH | `/api/v1/me` | **Update** `fullName`, `phone`, `email` |
| PATCH | `/api/v1/me/preferences` | **Update** `preferredLanguage` (`en`, `si`, `ta`) and `notificationsEnabled` |
| POST | `/api/v1/me/profile-image` | **Create/replace** the profile photo: multipart field `image` (JPEG, PNG, or WebP, up to 5 MB) |
| DELETE | `/api/v1/me/profile-image` | **Delete** the profile photo from Cloudinary and MongoDB |

`POST /api/v1/staff/auth/register` is the **Create** for a staff account; it also writes a welcome notification and an audit record.

A decision is atomic: the update only matches a `PENDING` request, so a second decision returns `409 PRIORITY_REQUEST_ALREADY_DECIDED`. Each decision stores `reviewedById`/`reviewedAt`, creates a `PRIORITY` notification for the patient, writes an `auditLogs` record, and on acceptance sets `priorityLevel: APPROVED_PRIORITY` on the booking's waiting queue entry when the patient has already checked in.

### Demo priority requests

The patient-side request API (Member 2) is not available yet, so the staff inbox is demonstrated with fictional seed data:

```bash
npm run db:seed:priority         # adds demo patients, bookings and 4 pending + 1 accepted request
npm run db:seed:priority:reset   # returns those demo requests to their starting state
```

The requests belong to **Demo Central Hospital** on today's sessions (Asia/Colombo), so register the staff account with that hospital to see them. The reset command changes only the demo requests; run it before each demonstration or usability-test participant.

### Profile photos (Cloudinary)

The mobile app sends the chosen photo to Express, which uploads it to Cloudinary as `queuecare/profiles/<userId>` and stores only `profileImageUrl` and `profileImagePublicId` in MongoDB. A new upload replaces the previous photo. Add these to `apps/api/.env` (Cloudinary Console → Settings → API Keys) and restart the API:

```text
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

The secrets are server-side only; never put them in `apps/mobile/.env`.

**Without Cloudinary keys, photos are stored in MongoDB.** The image bytes go into the `profileImages` collection (one document per user, replaced on each upload), and the user document stores a relative address such as `/media/profile-images/<random token>`. The app loads the photo from `GET /api/v1/media/profile-images/:token`, which needs no sign-in because the token is random and changes on every upload. This is a deviation from the main README (section 13.11: binary images are not stored in MongoDB) and should be recorded in `docs/milestone03/DEVIATIONS.md`. Adding the three Cloudinary keys switches new uploads to Cloudinary with no code change.

### Not implemented yet

- Staff verification code and administrator approval (M4-02, M4-04, M4-05): accounts are active on registration.

## Run locally

Use Node.js 22.13 or newer and a running MongoDB instance. All commands below run in the **QueueCare repository root**, where the root `package.json` is located.

```bash
npm ci
if [ ! -e apps/api/.env ]; then cp apps/api/.env.example apps/api/.env; fi
```

Configure the database and a random JWT_SECRET before starting; follow [the setup guide](../../docs/SETUP.md), then run `npm run check:setup`, `npm run check:db` and `npm run dev:api`. Copy the example only on first setup; keep existing local settings if `.env` already exists. The default database is `opd_queue` on `127.0.0.1:27017`. For another MongoDB instance, set `MONGODB_URI` and `MONGODB_DB_NAME` in `apps/api/.env`. Never commit credentials. The API loads this workspace's `.env` even when started with the root npm scripts.

MongoDB must already be running before starting the API. Set a random `JWT_SECRET` of at least 32 bytes in `apps/api/.env`; patient and staff sign-in require it. Startup checks the database connection and creates hospital, service, session, staff identity, and booking indexes. The server listens on port 4000 by default. `npm run start:api` runs without the development file watcher. Ctrl+C stops the API and closes its MongoDB connection.

In another terminal at the repository root, optionally add **three fictional demo hospitals**:

```bash
npm run db:seed:hospitals
```

This command inserts missing demo IDs only: repeated runs do not duplicate records, overwrite edited seeds, or delete existing data. It does not create users, services, or sessions. Starting the server does not seed data automatically.

For the hospital details/services flow, use `npm run db:seed:discovery` instead. It inserts the same missing demo hospitals plus six fictional OPD services, preserving existing records and edits. It creates no users or sessions. See [M1-06 setup and handoff](../../docs/HOSPITAL_DETAILS.md).

For session availability, run `npm run db:seed:sessions`. This adds missing demo hospitals/services and up to 12 fictional sessions for tomorrow in Asia/Colombo, preserving existing records. The command prints the date to query. To choose another day, use `npm run db:seed:sessions -- --date=YYYY-MM-DD`. See [M1-08 setup and next steps](../../docs/SESSIONS.md).

Try the endpoints:

```bash
curl http://localhost:4000/health
curl 'http://localhost:4000/api/v1/hospitals?search=demo&city=Colombo&page=1&limit=20'
curl http://localhost:4000/api/v1/hospitals/000000000000000000000101
curl http://localhost:4000/api/v1/hospitals/000000000000000000000101/services
```

An empty database returns a successful empty hospital list. Database failures return errors, not demo data. The complete search contract is in [docs/API.md](../../docs/API.md).

## Booking creation

`POST /api/v1/bookings` is implemented. Install dependencies from the root, configure server-only `JWT_SECRET`, `JWT_ISSUER`, and `JWT_AUDIENCE` in the existing API `.env`, and use Atlas or a replica set for writes. Missing JWT configuration leaves protected requests unavailable; standalone MongoDB returns 503 for booking without partial writes. A real login-issued token for an ACTIVE PATIENT is required. See [the contract, Member 2 auth handoff, and local replica-set setup](../../docs/BOOKING_API.md).

The `jose` dependency is pinned to its publisher’s official GitHub v6.2.12 release because this network presented an untrusted Fortinet certificate for the npm registry. The release checksum was verified; TLS verification stayed enabled. The manifest and lockfile record the HTTPS release URL. No global npm trust settings were changed.

## Expo Go connection

Keep the phone and computer on the same network. The API binds to `0.0.0.0` by default so it can accept phone requests. Set the mobile environment variable `EXPO_PUBLIC_API_BASE_URL` to `http://<computer-LAN-IP>:4000/api/v1` in `apps/mobile/.env` and restart Expo. `localhost` on a physical phone refers to the phone itself.

The Hospital Search screen now uses this public endpoint; follow the [M1-05 phone checklist](../../docs/HOSPITAL_SEARCH.md). Patient Home and My Bookings use the connected authenticated booking-list endpoint. Full phone acceptance remains pending.

## Troubleshoot MongoDB connections

Run this read-only check from the repository root using the settings in `apps/api/.env`:

```bash
npm run check:db
```

It connects and pings MongoDB without writing data. Success prints the selected database name. Startup, seeding, and the check command now distinguish TLS, DNS, authentication, network, permissions, and occupied-port errors without printing credentials or raw driver messages.

If `MONGODB_URI` points to Atlas, starting local `mongod` will not fix that Atlas connection. For an Atlas TLS/network failure:

1. Confirm the cluster is available in the correct Atlas project.
2. Check the project's **Network Access / IP Access List** and add your current public IP if it is missing. Allow the specific development IP; a network change or VPN can change it.
3. Check whether your VPN or firewall interferes with the connection. Keep TLS and certificate verification enabled.
4. Run `npm run check:db` again, then `npm run dev:api` once the check succeeds.

A TLS failure happens before database authentication; it does not by itself establish that the password or IP access list is wrong. See [MongoDB's connection troubleshooting guide](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

For intentional local development, use the values in `.env.example`. Local MongoDB and Atlas are separate databases; changing the URI does not transfer existing records. The application never silently switches between them.

## Tests

```bash
npm run test:api
```

Integration tests require `mongod` on PATH (or set `MONGOD_BINARY` to its executable path) and permission to listen on localhost. Each run launches its own MongoDB process with a fresh temporary directory and an ephemeral HTTP port, then cleans them up. Tests never use `MONGODB_URI` or modify your development database.

The recorded full API run for the opening-hours task passed 82 tests on 2026-10-06 (historical evidence). Coverage includes real MongoDB name/city filtering, hospital details, parent-scoped active services, inactive hospital exclusion, literal regex characters, pagination, public response fields, ID/query validation, health/error responses, shared connections, and safe repeatable seeding. Session tests additionally cover Sri Lanka date boundaries, future-start filtering, active service scope, full/overfull capacity, malformed records, and non-destructive session seeds. Booking tests launch a temporary single-node replica set and verify simultaneous final-slot/duplicate requests, rollback, concurrent eligibility changes, JWT validation, role/status enforcement, strict request bodies, and safe standalone rejection.

Booking-summary tests also verify owner isolation, role/status checks, public projection, status changes, inactive parents, malformed linked data, and reading a transactionally created booking. See [M1-12 screen/API handoff](../../docs/BOOKING_CONFIRMATION.md).

Notification tests verify the recipient/record contract, no duplicates on concurrent requests or transaction retry, preservation of read state, partial-index scope, and rollback of booking/capacity when notification insertion fails. Member 4’s notification list/read/read-all APIs and booking-alert navigation are integrated; see [booking notification handoff](../../docs/BOOKING_NOTIFICATIONS.md).

M1-15 adds the connected discovery-to-booking HTTP journey, the session-start boundary between eligibility and write, and safe booking-summary storage-failure handling. See [test results and requirements evidence](../../docs/TESTING.md).
