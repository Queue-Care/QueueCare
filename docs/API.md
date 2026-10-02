# API contracts

The root README section 15 defines the overall API routes. Hospital search and health are implemented; the Patient Home booking contract below remains proposed. See [API setup](../apps/api/README.md).

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
