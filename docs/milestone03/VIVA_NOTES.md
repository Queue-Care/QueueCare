# A3-17 — Individual viva and demo notes

Each member adds their own section. Every claim must match the code and the evidence that has actually been run. Do not describe pending phone or usability work as completed.

## Member 1 — Dayarathna A A D N (IT23681088)

**Scope:** Screens 01 Splash, 02 Welcome, 06 Home, 07 Find a Hospital, 08 Hospital Details, 09 Book Appointment and 10 Booking Confirmed; hospital/service/session discovery APIs; transactional booking creation; booking-confirmed notification. Also repository/release coordination and patient navigation integration.

Prepared 2026-10-07. The automated results below come from that day's run. The main booking path was reported passing on a phone on 2026-10-07; the remaining phone rows are still pending.

### Before the viva

- [ ] `npm install` on the demo laptop. Member 3's merge added `@react-native-community/datetimepicker`; without it the app and mobile tests fail to load.
- [ ] `npm run check:setup` passes; `apps/mobile/.env` points `EXPO_PUBLIC_API_BASE_URL` at the laptop's LAN IP, not `localhost`.
- [ ] MongoDB is a replica set (Atlas or local `--replSet`). Booking returns `BOOKING_UNAVAILABLE` on a standalone server.
- [ ] Seed fictional data: `npm run db:seed:discovery` and `npm run db:seed:sessions` (sessions are for tomorrow).
- [ ] One fictional patient account already registered, plus a second one for the duplicate/full demonstration.
- [x] Main [phone journey](../PATIENT_FLOW_TESTING.md) (search → book → confirmation → My Bookings → Alerts) reported passing on 2026-10-07. Rerun it on the demo phone on viva day and record the device/OS. Keep screenshots ready in case the network fails.
- [ ] `npm run test:patient-flow` and `npm run test:staff-patient-flow` pass on the demo laptop, so terminal output can be shown if asked.

### Demo script (3–5 minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Splash → Welcome | "Splash checks the session and routes. Welcome offers Get Started, Existing Account and Guest. These are routing screens, so they have no CRUD; that is documented in our CRUD matrix." |
| 0:30 | Sign in → Home | "Home reads my next appointment from `GET /bookings/me`. There is one primary Search hospitals action, placed first. That is the M1-16 fix for the duplicate-entry confusion found in Milestone 02 testing." |
| 1:00 | Find a Hospital, search by name/city | "Read: `GET /hospitals?search=&city=` returns only active hospitals, paginated, with a public projection. Empty, loading and error states are handled." |
| 1:30 | Hospital Details, pick service | "Read: hospital details and services. View OPD sessions sits right under the service choice. That is M1-17, the CTA hesitation finding." |
| 2:00 | Book Appointment, pick date and session | "Read: `GET /hospitals/:id/sessions` returns open future sessions with remaining capacity. Selecting a session does not reserve a place." |
| 2:30 | Confirm appointment | "Create: `POST /bookings` sends only the session ID with my JWT. The server decides who I am. One MongoDB transaction increments `bookedCount`, inserts the booking and inserts the notification." |
| 3:15 | Booking Confirmed | "Read: the screen loads the saved booking by ID, so the code, hospital, service and Sri Lanka time come from the database, not from the form." |
| 3:45 | Try the same session again, or a full session | "Duplicate gives `BOOKING_ALREADY_EXISTS`; full gives `SESSION_FULL`. The UI explains it and does not show a fake confirmation." |
| 4:15 | Alerts → open booking alert | "The booking-confirmed notification was written in the same transaction. Opening it marks it read, which is an Update, and opens the saved booking." |

### Code to open if asked

| Question | Where |
| --- | --- |
| How is double booking prevented? | Unique index `(patientId, sessionId)` in [bookingRepository.js:9-18](../../apps/api/src/modules/bookings/bookingRepository.js#L9-L18); in-transaction duplicate check; duplicate-key error mapped to `BOOKING_ALREADY_EXISTS` at [line 184](../../apps/api/src/modules/bookings/bookingRepository.js#L184) |
| How is over-capacity prevented? | Conditional update at [line 139](../../apps/api/src/modules/bookings/bookingRepository.js#L139): matches only `status: 'OPEN'`, `bookedCount < capacity` and a future start, then `$inc: { bookedCount: 1 }`. If nothing matched, the transaction aborts |
| Why a transaction? | [line 77](../../apps/api/src/modules/bookings/bookingRepository.js#L77): capacity, booking and notification ([line 164](../../apps/api/src/modules/bookings/bookingRepository.js#L164)) commit together or not at all. Snapshot read concern and majority write concern |
| How is the booking code unique? | `OPD-` + random UUID ([line 58](../../apps/api/src/modules/bookings/bookingRepository.js#L58)) plus a unique index on `bookingCode` |
| Who can read a booking? | Only the owning patient; another patient gets 404, so the API does not reveal that the booking exists. See [bookingDetails.js](../../apps/api/src/modules/bookings/bookingDetails.js) |
| Discovery routes | [hospitalRoutes.js](../../apps/api/src/modules/hospitals/hospitalRoutes.js): `/`, `/:hospitalId`, `/:hospitalId/services`, `/:hospitalId/sessions` |
| What if the network drops after Confirm? | [useBookingSubmission.ts](../../apps/mobile/src/features/booking/useBookingSubmission.ts) shows an uncertain-outcome message and does not auto-retry; the unique index still blocks a second booking |

### Likely questions

**Why React Native with Expo Go?** One codebase for Android and iOS, phone-sized like the prototype, and quick to preview on a real phone during a 7-day sprint. Expo Go is a development tool only; the assessed APK still needs a native build. See [TECH_STACK.md](TECH_STACK.md).

**Why MongoDB if you need transactions?** It is the agreed single database, and multi-document transactions on a replica set give the atomicity booking needs. The trade-off is that booking requires a replica set, and the API checks for one before writing.

**What CRUD does your workload demonstrate?** Create booking; Read hospitals, services, sessions and saved bookings; Update session `bookedCount` and notification `readAt`. Discovery screens are read-only by design, and Splash/Welcome have no data operations. There is no Delete in Member 1's flow. See [CRUD_MATRIX.md](CRUD_MATRIX.md).

**How did you test it?** Real HTTP + temporary MongoDB replica-set tests (443 API tests, including 12 patients competing for 3 places and 6 simultaneous duplicates). Jest tests drive the real app screens and navigation with simulated HTTP (453 mobile tests). Two cross-member journeys: `test:patient-flow` and `test:staff-patient-flow`. All passed on 2026-10-07. See [TESTING.md](../TESTING.md) and [MEMBER1_TEST_PROCEDURES.md](MEMBER1_TEST_PROCEDURES.md).

**Did testing find a real bug?** Yes. Switching directly between patient accounts while a booking was pending kept the old navigation history. A regression test exposed it; keying `NavigationContainer` by user identity fixed it. See [ISSUE_AND_FIX_LOG.md](ISSUE_AND_FIX_LOG.md).

**Which Milestone 02 usability findings did you implement?** M1-16, one clear Hospital Search entry on Home, and M1-17, a more prominent View OPD sessions action. Both are in [DEVIATIONS.md](DEVIATIONS.md).

**What did you add beyond the plan?** Optional hospital opening hours on Hospital Details, using fictional demo data.

### Limits to state honestly

- Sign-in is held in memory; restarting the app signs the patient out.
- Cancellation and rescheduling are Member 2's operations; a cancelled booking still blocks re-booking the same session under the current unique index.
- Opening hours in the demo data are fictional.
- The installable APK and five-participant usability results are group deliverables still in progress at the time of writing; update this line before the viva.
