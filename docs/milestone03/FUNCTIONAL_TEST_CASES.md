# Member 1 functional test evidence

This is Member 1's automated evidence, recorded for M1-15 on 2026-10-04. It does not mark other members' features or physical-phone acceptance complete. Reproduction and environment details: [testing guide](../TESTING.md).

| Case | Scenario and expected result | Automated evidence | Result |
| --- | --- | --- | --- |
| M1-T01 | Search name/city, literal punctuation, pagination; only active public hospital fields returned | API `hospitals.test.js`, `hospitalQuery.test.js`; mobile `HospitalSearchApi.test.ts`, `HospitalSearch.test.tsx` | Pass |
| M1-T02 | Open hospital/services; inactive/missing parents hidden; service selection passes correct ID | API `hospitalDetails.test.js`; mobile `HospitalDetailsApi.test.ts`, `HospitalDetails.test.tsx` | Pass |
| M1-T03 | Filter future sessions by date/service; show accurate remaining capacity and Sri Lanka times | API `hospitalSessions.test.js`; mobile `AvailableSessionsApi.test.ts`, `BookAppointment.test.tsx` | Pass |
| M1-T04 | Follow public discovery IDs through a final-place booking and saved summary; capacity drops once and one notification exists | API `discoveryBookingFlow.test.js`; mobile create-to-confirmation navigation in `ConfirmAppointment.test.tsx` | Pass in separate API/mobile layers |
| M1-T05 | Repeat patient/session POST, including cancelled bookings and simultaneous requests; one booking/notification, no extra capacity | API `bookings.test.js` duplicate cases | Pass |
| M1-T06 | 12 patients compete for 3 remaining places; exactly 3 succeed and 9 receive SESSION_FULL | API `bookings.test.js` concurrent-capacity case | Pass |
| M1-T07 | Session starts between eligibility read and conditional write; reject and restore all provisional writes | API `bookings.test.js` clock-boundary case | Pass |
| M1-T08 | Invalid JWT/body/account or changed hospital/session eligibility cannot create a booking | API `bookings.test.js`; mobile `CreateBookingApi.test.ts`, `ConfirmAppointment.test.tsx` | Pass |
| M1-T09 | Notification write failure rolls back booking/capacity; transient retry produces one event; repeated POST preserves read state | API `bookings.test.js` notification cases | Pass |
| M1-T10 | Patient reads only own booking; current statuses remain readable; malformed links and database errors stay safe failures | API `bookingDetails.test.js`; mobile `BookingDetailsApi.test.ts`, `BookingConfirmation.test.tsx` | Pass |
| M1-T11 | Double tap, uncertain result, sign-out, token refresh and account switch cannot cause stale navigation or repeated automatic submission | Mobile `ConfirmAppointment.test.tsx`, `CreateBookingApi.test.ts` | Pass |
| M1-T12 | Loading/error/result announcements, busy state, control/text contrast and focus cleanup | Mobile `Accessibility.test.tsx` | Pass; native speech/layout pending |
| M1-T13 | One primary Home search action before appointment actions; opens search in guest/loading/empty/error/appointment states; no guest private appointment request | Mobile `PatientHome.test.tsx`, added for M1-16 on 2026-10-05 | Pass; first-time user and phone acceptance pending |
| M1-T14 | Primary session action immediately follows service selection; scalable 52-point minimum touch target; selected/empty/error guidance and refresh invalidation; correct guest/patient routes | Mobile `HospitalDetails.test.tsx`, extended for M1-17 on 2026-10-05 | Pass; physical layout/touch and participant acceptance pending |

Manual acceptance still needed: real sign-in → discovery → booking → summary on Expo Go; phone/API connectivity failures; TalkBack/VoiceOver order and large text; notification visibility after Member 4 integration. No participant or physical-device result is inferred from these tests.
