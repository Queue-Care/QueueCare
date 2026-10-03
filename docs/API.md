# API contracts

## Patient account, bookings, and priority pages

These frontend contracts follow the supplied project plan. The backend remains pending. All responses use `{ "success": true, "data": ... }`; errors use an appropriate non-2xx status. Protected endpoints require a patient JWT and must enforce patient ownership on the server.

- `POST /api/v1/auth/patient/register`: body `{ fullName, nic, mobile, email?, password }`; data `{ verificationId }`. Never return the password. The client opens the existing mobile-verification route after success.
- `GET /api/v1/bookings/me?status=upcoming|past`: data is an array of joined booking summaries, with the same fields as the Home summary below. The list accepts CONFIRMED, CANCELLED, COMPLETED, SKIPPED, and RESCHEDULED. Filter/sort on the server according to the requested category.
- `GET /api/v1/bookings/:bookingId`: data is one joined booking summary, optionally including `patientName`, `maskedNic`, and `priorityRequestId`. The ID must match the route. Return only a masked NIC.
- `PATCH /api/v1/bookings/:bookingId/cancel`: successful data may be null or the updated booking. Enforce allowed cancellation transitions and release capacity atomically. The client refetches details after success.
- `POST /api/v1/bookings/:bookingId/priority-requests`: body `{ reason, note }`, where reason is ELDERLY, MOBILITY, PREGNANT, or OTHER and note is at most 500 characters. Data is a priority request `{ _id, bookingId, reason, status, createdAt, note?, decisionNote? }`. Only CONFIRMED bookings are eligible; prevent duplicate active requests on the server.
- `GET /api/v1/priority-requests/me`: data is an array of those priority requests. The status page finds its requestId, then reads its associated booking. Status is PENDING, ACCEPTED, or DECLINED. Only staff may make a decision; return the actual decision and optional decisionNote.

All dates must be valid ISO timestamps with Z or an explicit offset. All identifier and display-name fields must be nonempty strings. The registration endpoint normalizes and validates NIC/mobile and hashes passwords on the server; client validation is not a substitute for server validation. Use 409 for duplicate registration, conflicting cancellation, or an existing active priority request.

The root README section 15 defines the overall API routes. The API application is not implemented yet. The contract below is the proposed integration shape used by Member 1's Patient Home adapter; it is not evidence of a live endpoint.

## Patient Home — next appointment

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
