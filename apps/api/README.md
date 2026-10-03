# QueueCare API

Member 1's M1-04 implements public hospital search using Express and MongoDB. M1-06 adds hospital details and active OPD service catalogs. The supporting server, database connection, discovery indexes, and shared error handler are available. M1-08 adds available sessions with date/service filters and remaining capacity. M1-10 adds protected booking creation with JWT verification, role/account checks, and MongoDB transactions. Login/token issuance, booking read/edit APIs, and staff session writes are still pending.

## Run locally

Use Node.js 22.13 or newer and a running MongoDB instance. All commands below run in the **QueueCare repository root**, where the root `package.json` is located.

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api
```

Copy the example only on first setup; keep existing local settings if `.env` already exists. The default database is `opd_queue` on `127.0.0.1:27017`. For another MongoDB instance, set `MONGODB_URI` and `MONGODB_DB_NAME` in `apps/api/.env`. Never commit credentials. The API loads this workspace's `.env` even when started with the root npm scripts.

MongoDB must already be running before starting the API. Startup checks the database connection and creates hospital, service, session, and unique booking indexes. The server listens on port 4000 by default. `npm run start:api` runs without the development file watcher. Ctrl+C stops the API and closes its MongoDB connection.

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

The Hospital Search screen now uses this public endpoint; follow the [M1-05 phone checklist](../../docs/HOSPITAL_SEARCH.md). Patient Home's booking request still needs the pending authentication and booking endpoints; starting this API does not complete that flow.

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

All 50 API tests pass as of M1-10. Coverage includes real MongoDB name/city filtering, hospital details, parent-scoped active services, inactive hospital exclusion, literal regex characters, pagination, public response fields, ID/query validation, health/error responses, shared connections, and safe repeatable seeding. Session tests additionally cover Sri Lanka date boundaries, future-start filtering, active service scope, full/overfull capacity, malformed records, and non-destructive session seeds. Booking tests launch a temporary single-node replica set and verify simultaneous final-slot/duplicate requests, rollback, concurrent eligibility changes, JWT validation, role/status enforcement, strict request bodies, and safe standalone rejection.
