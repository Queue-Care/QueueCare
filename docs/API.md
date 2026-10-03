# API contracts

The root README section 15 defines the overall API routes. Hospital search, details, OPD services, available sessions, protected booking creation, and health are implemented; the Patient Home booking contract below remains proposed. See [API setup](../apps/api/README.md).

## Hospital search — implemented (M1-04)

```http
GET /api/v1/hospitals?search=central&city=Colombo&page=1&limit=20
Accept: application/json
```

Public endpoint: guest browsing does not require authentication. Returns only documents with `isActive: true`. `search` matches a literal substring in either hospital name or city, ignoring case. An optional `city` filter matches a full city name, ignoring case; both filters apply when provided. Blank text filters are ignored. Regular expression characters are treated as text.

| Parameter | Default | Validation |
| --- | --- | --- |
| `search` | Empty | One string, trimmed, maximum 100 characters, no control characters |
| `city` | Empty | One string, trimmed, maximum 80 characters, no control characters |
| `page` | `1` | Integer 1–1000, written as digits without leading zeros |
| `limit` | `20` | Integer 1–50, written as digits without leading zeros |

Unknown parameters and repeated parameters are rejected with HTTP 400, `VALIDATION_ERROR`, and field-specific messages. Results use case-insensitive ascending name order, with `_id` as a stable tie-breaker.

```json
{
  "success": true,
  "data": [
    {
      "_id": "000000000000000000000101",
      "name": "Demo Central Hospital",
      "address": "Demo location — not a real hospital",
      "city": "Colombo"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false }
}
```

`phone` and `imageUrl` are included when present in MongoDB. Internal fields such as `imagePublicId` are excluded. IDs are strings. No matches return `data: []`, `total: 0`, `totalPages: 0`, and `hasNextPage: false`. A page beyond the results returns an empty array while retaining the matching total. Pagination/count are separate reads and may reflect concurrent edits; no snapshot guarantee is provided.

Unexpected database/query errors return HTTP 500 with `INTERNAL_ERROR`, a generic message, and no successful `data` fallback. The shared handler follows the README's `success: false, error: { code, message, fieldErrors }` format. Unknown endpoints return 404 `NOT_FOUND`.

`GET /health` pings MongoDB. Success returns `{ "success": true, "data": { "status": "ok", "database": "connected" } }`; database failure returns HTTP 503 `SERVICE_UNAVAILABLE`.

## Hospital details and services — implemented (M1-06)

These endpoints are public for guest and patient discovery. `hospitalId` must be a 24-character hexadecimal MongoDB ObjectId; uppercase hex is accepted. Invalid IDs return HTTP 400 `VALIDATION_ERROR` with `fieldErrors.hospitalId`. Neither endpoint accepts query parameters; unsupported parameters return 400.

```http
GET /api/v1/hospitals/000000000000000000000101
Accept: application/json
```

```json
{
  "success": true,
  "data": {
    "_id": "000000000000000000000101",
    "name": "Demo Central Hospital",
    "address": "Demo location — not a real hospital",
    "city": "Colombo"
  }
}
```

The details response includes `phone` and `imageUrl` when stored. It exposes only the same public hospital fields as search, without internal image IDs, flags, timestamps, or notes.

```http
GET /api/v1/hospitals/000000000000000000000101/services
Accept: application/json
```

```json
{
  "success": true,
  "data": [
    { "_id": "000000000000000000000201", "hospitalId": "000000000000000000000101", "name": "General OPD" },
    { "_id": "000000000000000000000202", "hospitalId": "000000000000000000000101", "name": "Medical clinic" }
  ],
  "meta": { "total": 2 }
}
```

Services come from `opdServices` and require both the selected hospital and service to have `isActive: true`. Only services linked by the selected hospital's ObjectId are included. IDs are serialized as strings. Services use case-insensitive ascending name order with an `_id` tie-breaker. This endpoint returns the hospital's whole service catalog without pagination; `meta.total` is the returned array length. It is intended for the small per-hospital academic dataset, not bulk service search.

A valid active hospital with no active services returns `{ "success": true, "data": [], "meta": { "total": 0 } }`. A missing or inactive hospital returns the same HTTP 404 response on both endpoints, even if service records exist:

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Hospital not found.", "fieldErrors": {} } }
```

Database failures return HTTP 500 `INTERNAL_ERROR`, never a successful empty catalog or false 404. Hospital and service reads are separate operations, not a transactional snapshot. Session availability and capacity are returned by the M1-08 endpoint below, not inferred from the service catalog. Opening hours are not present in the README's current hospital schema and are not invented by this API. See [M1-06 handoff and M1-07 integration](HOSPITAL_DETAILS.md).

## Available sessions — implemented (M1-08)

```http
GET /api/v1/hospitals/000000000000000000000101/sessions?date=2026-10-03&serviceId=000000000000000000000201
Accept: application/json
```

Public endpoint for active hospitals and their active services. The example date is illustrative; use a future date containing sessions when testing.

| Parameter | Default | Validation |
| --- | --- | --- |
| `date` | Today's calendar date in `Asia/Colombo` | One real `YYYY-MM-DD` date, years 1000–9999 |
| `serviceId` | All active services of this hospital | One 24-character hexadecimal ObjectId |

Malformed hospital IDs, blank/invalid filters, repeated parameters, and unknown parameters return HTTP 400 `VALIDATION_ERROR` with field errors. Missing/inactive hospitals return 404 `NOT_FOUND`. A specified service that is missing, inactive, or belongs to another hospital also returns 404. Valid filters with no sessions return a successful empty list.

```json
{
  "success": true,
  "data": [
    {
      "_id": "000000000000000000000301",
      "hospitalId": "000000000000000000000101",
      "serviceId": "000000000000000000000201",
      "serviceName": "General OPD",
      "doctorOrTeam": "Demo OPD team",
      "sessionDate": "2026-10-03",
      "startTime": "09:00",
      "endTime": "10:00",
      "startsAt": "2026-10-03T03:30:00.000Z",
      "endsAt": "2026-10-03T04:30:00.000Z",
      "status": "OPEN",
      "capacity": 20,
      "bookedCount": 8,
      "remainingCapacity": 12,
      "isBookable": true
    }
  ],
  "meta": { "date": "2026-10-03", "timeZone": "Asia/Colombo", "total": 1, "bookableCount": 1 }
}
```

Returns only `OPEN` sessions whose start instant is strictly later than the server's captured request time. Sessions already started, including exactly at the cutoff, are excluded. Dates/times describe Sri Lanka local time; ISO timestamps carry UTC `Z`. Results are ordered by start time, then ID. This is an unpaginated daily hospital catalog intended for the small academic dataset.

Full sessions remain visible with `remainingCapacity: 0` and `isBookable: false`; overbooked legacy records also clamp remaining capacity to zero. `meta.total` counts returned sessions and `bookableCount` counts sessions with spare capacity. Invalid times, end times at/before the start, invalid capacity/counts, and missing display data are excluded. Staff/internal fields are omitted.

Availability reads do not reserve capacity or guarantee a booking. Hospital, service, and session reads are separate; the M1-10 booking transaction revalidates status, parent/service activity, duplicate bookings, and capacity atomically. Database failures return HTTP 500 `INTERNAL_ERROR`, never successful empty availability. See [storage conventions, demo seeding, and M1-09 handoff](SESSIONS.md).

## Create booking — implemented (M1-10)

```http
POST /api/v1/bookings
Authorization: Bearer <JWT>
Content-Type: application/json

{"sessionId":"000000000000000000000301"}
```

Requires a verified JWT and a current ACTIVE PATIENT account. The only accepted field is a 24-character hexadecimal `sessionId`; query parameters and additional fields (including `patientId`) return 400. Patient identity comes from the verified token subject and current database account.

Success returns HTTP 201:

```json
{
  "success": true,
  "data": {
    "_id": "000000000000000000000401",
    "bookingCode": "OPD-74A099F60D3B48C18409D3A835176FA0",
    "patientId": "000000000000000000000001",
    "sessionId": "000000000000000000000301",
    "status": "CONFIRMED",
    "createdAt": "2026-10-03T02:00:00.000Z",
    "updatedAt": "2026-10-03T02:00:00.000Z"
  }
}
```

The booking insert, conditional capacity increment, and M1-13 booking-confirmed notification insert commit together. Notification storage failure aborts the transaction and returns a generic 500. Existing patient/session pairs return 409 `BOOKING_ALREADY_EXISTS` even if cancelled; full sessions return 409 `SESSION_FULL`; closed/started/malformed sessions or inactive parents return 409 `SESSION_UNAVAILABLE`. Missing sessions return 404. Invalid authentication returns 401, and non-patient/inactive accounts return 403. Unconfigured JWT verification or a standalone database returns 503. Unexpected failures return a generic 500 with no driver details.

A lost response may follow a successful commit. Repeated requests prevent duplicates but do not replay the original 201; callers must handle `BOOKING_ALREADY_EXISTS` and recover the existing booking through Member 2's list/details endpoints when available. M1-13 persists one unread confirmation notification using the [notification contract](BOOKING_NOTIFICATIONS.md). Repeated POSTs do not reset its read state. Member 4’s notification read APIs remain pending. See [full contract, auth handoff, and replica-set setup](BOOKING_API.md).

## Read booking summary — implemented (M1-12)

```http
GET /api/v1/bookings/:bookingId
Authorization: Bearer <JWT>
Accept: application/json
```

Requires a verified JWT and a current ACTIVE PATIENT account. `bookingId` must be a 24-character hexadecimal MongoDB ID. Query parameters are not accepted. Identity comes from authentication; the query matches both booking ID and patient ID. Another patient's booking and a missing booking return identical 404 `NOT_FOUND` responses.

HTTP 200 returns `Cache-Control: no-store` and the following joined DTO:

```json
{
  "success": true,
  "data": {
    "_id": "000000000000000000000401",
    "bookingCode": "OPD-74A099F60D3B48C18409D3A835176FA0",
    "patientId": "000000000000000000000001",
    "sessionId": "000000000000000000000301",
    "status": "CONFIRMED",
    "createdAt": "2026-10-03T02:00:00.000Z",
    "updatedAt": "2026-10-03T02:00:00.000Z",
    "hospital": {
      "_id": "000000000000000000000101",
      "name": "Example Hospital",
      "address": "Example address",
      "city": "Colombo",
      "isActive": true
    },
    "service": {
      "_id": "000000000000000000000201",
      "name": "General OPD",
      "isActive": true
    },
    "session": {
      "_id": "000000000000000000000301",
      "hospitalId": "000000000000000000000101",
      "serviceId": "000000000000000000000201",
      "doctorOrTeam": "OPD team",
      "status": "OPEN",
      "sessionDate": "2026-10-03",
      "startTime": "09:00",
      "endTime": "10:00",
      "startsAt": "2026-10-03T03:30:00.000Z",
      "endsAt": "2026-10-03T04:30:00.000Z"
    }
  }
}
```

All known booking and session statuses are readable, including past sessions and inactive hospitals/services. Times use the same Asia/Colombo conversion as booking creation. This is a read of current linked records, not a historical snapshot; separate queries do not guarantee a snapshot across concurrent edits. No capacity or booking fields are changed.

Malformed IDs/query parameters return 400 `VALIDATION_ERROR`; invalid authentication returns 401; inactive/non-patient accounts return 403. Missing or inconsistent linked records return 409 `BOOKING_DETAILS_UNAVAILABLE`. Unconfigured authentication/repository returns 503, and unexpected database failures return generic 500 errors. No private notes, user profile, or NIC fields are returned. Member 2's list/actions/staff access remain pending; register future static `/bookings/me` before the parameter route. See [screen behavior and phone checks](BOOKING_CONFIRMATION.md).

## Patient Home — next appointment (proposed; not implemented)

**Owner handoff:** Member 2's patient booking-list API, using Member 3's MongoDB/session foundation. Member 1 consumes the result in Home.

```http
GET /api/v1/bookings/me?status=upcoming&limit=1
Authorization: Bearer <JWT>
Accept: application/json
```

Authenticate and authorize the patient on the server. Scope results to the patient identified by the JWT. Join the booking with its hospital, service, and OPD session. Return only CONFIRMED bookings in future or still-running sessions, ordered by session start ascending (with a stable booking-ID tie-breaker), and apply `limit=1` after filtering and sorting. The client must receive the earliest relevant booking, not an arbitrary page item.

Successful response:

```json
{
  "success": true,
  "data": [
    {
      "_id": "booking-id",
      "bookingCode": "OPD-101",
      "status": "CONFIRMED",
      "hospitalName": "Example Hospital",
      "serviceName": "General OPD",
      "startsAt": "2026-10-04T09:00:00+05:30"
    }
  ]
}
```

The example above is documentation only; the application has no demo-booking fallback. All displayed fields are required nonempty strings. `_id` is the booking's ID, not the hospital/session ID. `startsAt` is an ISO datetime with `Z` or an explicit offset, derived from the session's date/time. Home displays it in Asia/Colombo time even when the phone uses a different timezone.

No upcoming bookings:

```json
{ "success": true, "data": [] }
```

Follow README section 16 for errors, using an appropriate HTTP status and `success: false`. In particular, use 401 for unauthenticated/expired sessions and 403 for forbidden access. A server error or malformed body must not be converted into a successful empty list.

The adapter validates the envelope and booking summary. It requires zero or one booking, rejects unzoned/invalid dates and unexpected booking statuses, and never renders raw backend error messages. Requests time out after 15 seconds and are cancelled when superseded or when Home loses focus.

This is a joined response DTO, not a change to the README's MongoDB document schema. API owners should confirm this contract before implementing the endpoint; update the client and its tests together if the shape changes.
