# Database implementation status

The root README section 13 defines the planned MongoDB schemas. Hospital discovery, OPD service catalogs, and session availability now have working read repositories/indexes and seeds; other collections remain pending.

## Hospitals

Database selection comes from `MONGODB_DB_NAME` (default `opd_queue`). The `hospitals` documents follow README section 13.2: `_id` as ObjectId; `name`, `address`, and `city` as strings; optional `phone`, `imageUrl`, and `imagePublicId`; `isActive` as boolean; and `createdAt`/`updatedAt` as dates. There is no hospital write API or collection-level schema validator yet.

Startup and the hospital seed create these indexes idempotently:

| Index | Fields | Collation |
| --- | --- | --- |
| `hospital_active_name` | `isActive`, `name`, `_id` ascending | `en`, strength 2 |
| `hospital_active_city_name` | `isActive`, `city`, `name`, `_id` ascending | `en`, strength 2 |

The repository includes only active documents and exposes a fixed set of public fields. Name ordering ignores case and uses `_id` to break ties. Text filters are escaped before being used in regex queries. Case-insensitive substring regex search can scan the active records even with these indexes; it is intended for the small academic dataset. Review query plans before scaling. Each query has a three-second MongoDB execution limit, with a maximum page size of 50.

`npm run db:seed:hospitals` adds three clearly named fictional demo hospitals using fixed IDs and `$setOnInsert`. It neither deletes data nor overwrites existing records. No real hospital contact details are invented. See [run and seed instructions](../apps/api/README.md).

## OPD services — M1-06

The `opdServices` documents follow README section 13.3: `_id` and `hospitalId` as ObjectIds, `name` as a string, `isActive` as a boolean, and `createdAt`/`updatedAt` as dates. There is no service write endpoint or database schema validator yet.

Startup/seed index setup also creates `service_hospital_active_name` on `{ hospitalId: 1, isActive: 1, name: 1, _id: 1 }`, with `en` collation at strength 2. The service read first verifies the parent is active, then reads only that hospital's active services with a three-second query execution limit. The response exposes only `_id`, `hospitalId`, and `name`.

`npm run db:seed:discovery` extends the explicit hospital seed with six fictional service records, using fixed IDs and `$setOnInsert`. Missing/inactive demo parents are skipped. Reruns preserve service edits and existing records. Services do not imply open sessions or available booking capacity. Opening hours are not yet represented in the hospital schema.

## OPD sessions — M1-08 read API

`opdSessions` uses the README's ObjectId relationships, `doctorOrTeam`, `sessionDate`, `startTime`, `endTime`, `capacity`, `bookedCount`, status, and timestamps. Staff session creation/editing remains Member 3's work; no collection validator or session write endpoint is implemented yet.

**Storage convention for future writers:** `sessionDate` is a BSON Date at UTC midnight representing the selected calendar date, e.g. `2026-10-03T00:00:00.000Z`. It is a day marker, not the session's start instant or Sri Lanka midnight. Store `startTime`/`endTime` as zero-padded 24-hour `HH:mm` strings interpreted in `Asia/Colombo`. The read pipeline uses MongoDB `$dateFromString` with that timezone to derive UTC instants. Sessions must start and end on the same day, with end after start. Capacity is a positive safe integer; booked count is a nonnegative safe integer. Malformed records are excluded from public availability.

Startup and seeds create `session_hospital_status_date_service` on `{ hospitalId: 1, status: 1, sessionDate: 1, serviceId: 1, startTime: 1, _id: 1 }`. The query selects an active hospital's active services and `OPEN` sessions on the chosen date, then calculates timestamps, filters already-started sessions, and sorts by start/ID. The computed timestamp sort is not supplied by the index. Reads have a three-second execution limit.

`npm run db:seed:sessions` inserts missing demo hospitals/services plus two fictional sessions per active demo service for tomorrow in Sri Lanka (up to 12). `-- --date=YYYY-MM-DD` selects another day. IDs are stable per service/date/time, and `$setOnInsert` preserves existing session edits, counts, status, and other data. New dates intentionally create additional records. System demo seeds use `seedSource: "queuecare-demo"` and omit `createdById`; future authenticated staff writes must provide their real creator ID. No fictitious staff accounts are created. See [session setup and handoff](SESSIONS.md).

## Bookings — M1-10

`POST /api/v1/bookings` persists the README's ObjectId `patientId`/`sessionId`, unique `bookingCode`, `CONFIRMED` status, and BSON `createdAt`/`updatedAt`. Startup creates unique `booking_patient_session_unique` on `{ patientId: 1, sessionId: 1 }` and `booking_code_unique` on `{ bookingCode: 1 }`. The patient/session constraint applies to every status; cancellation does not allow another POST for that pair. Existing duplicate records are not deleted automatically when indexes fail to build.

Creation requires a replica set or sharded deployment and uses a transaction with the conditional capacity increment. Standalone MongoDB returns 503 without a partial write. Snapshot reads, majority commit, conditional updates, and unique indexes protect capacity and duplicates. `bookingRevision` fields on users/hospitals/services are internal lock counters updated in the same transaction to force fresh eligibility checks during concurrent suspension/deactivation; rollback restores those counters too. No public response exposes them.

The minimal `users` read is for JWT/account authorization only. Registration, password hashes, user seed data, login, and profile APIs remain pending. Cancellation/rescheduling owners must update bookings and capacity together and preserve the all-status uniqueness rule. See [transaction details and local replica-set setup](BOOKING_API.md).
