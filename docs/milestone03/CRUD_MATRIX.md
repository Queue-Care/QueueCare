# Member 1 CRUD evidence

Automated evidence only, updated 2026-10-06 after booking-read, notification and opening-hours integration. Navigation, selection, polling and mocked responses are not counted as database writes. This is Member 1's contribution to A3-03; group-wide CRUD compliance and physical demonstrations remain pending.

| Flow | Implemented operation | Persistence evidence | Limit |
| --- | --- | --- | --- |
| Hospital Search/Details | Read active hospital/service records and optional opening hours | Real MongoDB HTTP tests in `hospitals.test.js`, `hospitalDetails.test.js` | Read-only interface; filtering/selecting is not a second CRUD operation. No staff hospital/service write UI/API claimed |
| Book Appointment availability | Read future sessions/capacity | `hospitalSessions.test.js`, `discoveryBookingFlow.test.js` | Reading/selecting does not reserve a place |
| Confirm appointment | Create booking; update session booked count and private eligibility revisions | `bookings.test.js` asserts persisted documents, concurrency limits and rollback | No cancellation/rescheduling implementation claimed |
| Booking Confirmation | Read owned booking and linked records | `bookingDetails.test.js`, connected `discoveryBookingFlow.test.js` | Refresh is a read, not another booking |
| Booking-confirmed event | Create one MongoDB notification in the booking transaction | `bookings.test.js` asserts count, recipient, read state and rollback | Background event production is part of the booking flow, not a separate user interface |
| Patient Home / My Bookings | Read owned upcoming/history bookings with filters and pagination | Real HTTP/MongoDB `bookingList.test.js` and `discoveryBookingFlow.test.js`; mobile `BookingList.test.tsx` | `/bookings/me` is connected. Cancellation/rescheduling backend operations remain pending |
| Booking Alerts integration | Read owned notifications; update persisted `readAt`; read linked owned booking | `bookingList.test.js` verifies list/detail/read persistence and ownership; `BookingNotifications.test.tsx` verifies mobile navigation | Member 4 owns notification CRUD. This records the integrated booking-alert path only; phone demonstration remains pending |

Splash and Welcome have no domain-data CRUD operations; their purpose is startup and navigation. Booking Confirmation is a read of the booking created in the preceding flow. Refresh remains Read, and service selection is transient UI state. Discovery and confirmation therefore do not independently demonstrate two CRUD operations: the group must document their read-only rationale against the assessment rubric rather than inventing write operations. The connected booking flow demonstrates Create booking, Read saved details and Update capacity; Alerts adds a persisted read-state Update. No assessment approval or complete group-wide compliance is inferred from those facts.

Deletion is not part of Member 1's booking/discovery API. Test helper teardown deletes only its owned temporary test directory; it is not product CRUD evidence. [Functional case mapping](FUNCTIONAL_TEST_CASES.md).
