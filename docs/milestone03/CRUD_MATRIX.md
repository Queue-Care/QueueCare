# Member 1 CRUD evidence

Automated evidence only, as of M1-15. Navigation and mocked responses are not counted as persistence. Other members' cancellation/rescheduling/notification-read work must add its own evidence.

| Flow | Implemented operation | Persistence evidence | Limit |
| --- | --- | --- | --- |
| Hospital Search/Details | Read active hospital/service records | Real MongoDB HTTP tests in `hospitals.test.js`, `hospitalDetails.test.js` | No staff hospital/service write UI/API claimed |
| Book Appointment availability | Read future sessions/capacity | `hospitalSessions.test.js`, `discoveryBookingFlow.test.js` | Reading/selecting does not reserve a place |
| Confirm appointment | Create booking; update session booked count and private eligibility revisions | `bookings.test.js` asserts persisted documents, concurrency limits and rollback | No cancellation/rescheduling implementation claimed |
| Booking Confirmation | Read owned booking and linked records | `bookingDetails.test.js`, connected `discoveryBookingFlow.test.js` | Refresh is a read, not another booking |
| Booking-confirmed event | Create one MongoDB notification in the booking transaction | Notification tests assert count, recipient, read state and rollback | Notification list/read/read-all APIs remain pending |
| Patient Home | Consume next-appointment summary | Mocked transport/navigation tests | Real booking-list endpoint integration pending |

Deletion is not part of Member 1's booking/discovery API. Test helper teardown deletes only its owned temporary test directory; it is not product CRUD evidence. [Functional case mapping](FUNCTIONAL_TEST_CASES.md).
