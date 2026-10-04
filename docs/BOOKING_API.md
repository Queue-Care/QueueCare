# Booking creation — M1-10

M1-10/M1-11 are merged in local history (PR #18). M1-10 adds protected `POST /api/v1/bookings`, unique booking indexes, and a MongoDB transaction that reserves one place and inserts one booking together; M1-13 now includes its unread notification in that transaction. M1-11’s [mobile confirmation action](CONFIRM_APPOINTMENT.md) now calls this endpoint. M1-12’s [Booking Confirmation screen](BOOKING_CONFIRMATION.md) is implemented. M1-13’s [booking notification producer](BOOKING_NOTIFICATIONS.md) is implemented; Member 4’s read API/screen integration remains pending. M1-14’s [accessibility refinements](ACCESSIBILITY.md) are implemented. M1-15’s [test coverage and evidence](TESTING.md) are complete. **Next: M1-16 — clarify Hospital Search entry points.**

## Request and result

```http
POST /api/v1/bookings
Authorization: Bearer <JWT from the real login service>
Content-Type: application/json

{"sessionId":"000000000000000000000301"}
```

`sessionId` is the only accepted field. It must be a 24-character hexadecimal ObjectId. Unknown fields and query parameters are rejected. The patient always comes from verified authentication; sending `patientId`, role, status, capacity, or a booking code cannot change that identity or bypass checks.

Success is HTTP 201 with `success: true` and `data` containing `_id`, `bookingCode`, `patientId`, `sessionId`, `status: "CONFIRMED"`, `createdAt`, and `updatedAt`. IDs are strings and timestamps are UTC ISO strings. The code is `OPD-` followed by 32 uppercase UUID hexadecimal characters, protected by a unique index. No profile, credentials, or internal revision fields are returned.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid JSON, session ID, or unsupported fields/parameters |
| 401 | `UNAUTHORIZED` | Missing/invalid/expired JWT or deleted account |
| 403 | `FORBIDDEN` | Non-patient or inactive account |
| 404 | `NOT_FOUND` | Session does not exist |
| 409 | `BOOKING_ALREADY_EXISTS` | Patient/session pair already exists, including a cancelled booking |
| 409 | `SESSION_FULL` | No remaining capacity |
| 409 | `SESSION_UNAVAILABLE` | Closed, started, malformed, or inactive hospital/service/session |
| 503 | `SERVICE_UNAVAILABLE` | JWT verification is not configured |
| 503 | `BOOKING_UNAVAILABLE` | MongoDB deployment does not support transactions |
| 500 | `INTERNAL_ERROR` | Unexpected failure; internal driver messages are hidden |

An interrupted HTTP response can occur after a successful commit. Retrying cannot reserve another place for the same patient/session; it returns `BOOKING_ALREADY_EXISTS`. This is duplicate prevention, not an idempotent replay of the original success response. M1-11 explains this outcome, offers an explicit retry of the same session, and links to My bookings. Recovery through Member 2's booking list/details still depends on their implementation. Do not tell the patient that every network error means no booking was made.

## JWT handoff for Member 2 / S-17

Only the verification prerequisite is implemented here; registration, login, password verification, token issuance/storage, profile loading, and logout remain their owners' work.

Configure these **server-only** variables in the existing `apps/api/.env`:

```dotenv
JWT_SECRET=<random secret of at least 32 bytes>
JWT_ISSUER=queuecare-api
JWT_AUDIENCE=queuecare-mobile
```

Use a cryptographically random secret shared with the real login service. Do not copy a literal placeholder, put the secret in `EXPO_PUBLIC_*`, or commit it. Missing configuration keeps protected requests unavailable while public discovery remains usable; a configured short secret fails startup with a safe diagnostic.

JWT verification uses `jose`, accepts only HS256, validates issuer/audience/signature/expiry and not-before, and requires `sub`, `iat`, and `exp`. `sub` must identify the user's MongoDB ObjectId. Tokens cannot be more than 24 hours old; the login owner can choose a shorter expiry. The current database account must exist, be `ACTIVE`, and have role `PATIENT`. Token role/profile claims are not authorization. The transaction rechecks patient eligibility before writing.

The default mobile startup still returns signed out. No demo login or token-signing endpoint has been introduced. M1-11 enables confirmation only when real authentication/profile data and a future available session are present. The default signed-out app retains the guest gate.

## Transactions and database ownership

Booking writes require **MongoDB Atlas or a replica set**. Existing standalone MongoDB can still serve discovery but booking returns 503 without performing writes. The code never falls back to a non-transactional increment/insert. See [MongoDB's transaction documentation](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

The transaction uses snapshot reads, majority commit, primary routing, sequential database operations, and the driver's transaction/commit retry handling within a ten-second timeout. Each attempt rechecks patient, hospital/service activity, session relationships, OPEN status, future start in Asia/Colombo, valid date/time/capacity/count, and duplicates. The conditional session update increments `bookedCount` only below capacity, followed by booking and notification insertion. A failure rolls back all three operations.

Private `bookingRevision` counters on the patient, hospital, and service are incremented inside the transaction to acquire write locks. These prevent eligibility checks from relying on a stale snapshot during concurrent suspension/deactivation. Failed transactions also roll back those counters. They are not public fields. This deliberately serializes concurrent bookings for a hospital; revisit the locking strategy before production-scale traffic. Future staff/account writers should update existing records, preserving unrelated fields.

Startup creates unique indexes on `{ patientId: 1, sessionId: 1 }` and `{ bookingCode: 1 }`. Existing duplicates cause startup failure; no data is deleted automatically. Following the README's all-status patient/session uniqueness, cancelled bookings cannot be recreated by POST. Member 2's cancellation/rescheduling must coordinate capacity and indexes transactionally. M1-13 inserts the booking-confirmed notification using the same transaction/session. A partial unique index protects confirmation events; no external delivery occurs inside the retried callback. See [record contract and Member 4 handoff](BOOKING_NOTIFICATIONS.md).

Session storage follows [M1-08's date/time convention](DATABASE.md#opd-sessions--m1-08-read-api). The API verifies that a session has not started immediately before its conditional capacity update; final booking eligibility is always decided by the server.

## Local replica set (optional)

Atlas already supports transactions. For a separate local development replica set, use a **new directory and port**, keeping any existing standalone database untouched. With `mongod` and `mongosh` installed, run from the repository root:

```bash
mkdir -p /tmp/queuecare-booking-dev
mongod --dbpath /tmp/queuecare-booking-dev --replSet queuecareDev --bind_ip 127.0.0.1 --port 27018
```

In another terminal:

```bash
mongosh 'mongodb://127.0.0.1:27018/?directConnection=true' --eval 'rs.initiate({_id:"queuecareDev",members:[{_id:0,host:"127.0.0.1:27018"}]})'
```

Set `MONGODB_URI=mongodb://127.0.0.1:27018/opd_queue?replicaSet=queuecareDev` in `apps/api/.env`, then run `npm run check:db`, `npm run db:seed:sessions`, and `npm run dev:api`. This is a separate database and does not copy Atlas data. A real authenticated active patient account is still required to create bookings. These setup commands have not been run against your development data.

## Tests

`npm run test:api` includes real temporary MongoDB replica-set tests for concurrent final-slot booking, simultaneous duplicate requests, transaction rollback after insertion failure, session closure/hospital deactivation during a transaction, strict payloads, and JWT/account authorization. The test helper owns a fresh temporary directory and process, and does not use `apps/api/.env` or modify development/Atlas data.

All 64 API tests pass as of M1-15, including notification atomicity, duplicate protection, and transient-retry coverage. Verification status is recorded in [the development plan](DEVELOPMENT_PLAN.md).
