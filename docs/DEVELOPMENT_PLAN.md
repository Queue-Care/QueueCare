# Foundation setup

The task definitions and ownership remain in the root README.

## Current status

- Patient pages update: Welcome now follows supplied HTML screen 02. Create Account, My Bookings, Booking Details, Request Priority, and Request Status replace their navigation placeholders with frontend pages and API adapters (HTML screens 05 and 11–14). Registration validation, confirmed-booking cancellation confirmation, priority submission, and decision rendering are implemented on the client. Backend CRUD, real verification/session restoration, and phone fidelity verification remain pending. See [patient pages handoff](PATIENT_PAGES.md).

- S-01: The local repository has an origin at `https://github.com/Queue-Care/QueueCare.git` and local `main` and `develop` branches. Remote branch protection and required PR review have not been verified.
- S-02: The repository folders and npm workspace manifests are configured. Empty directories contain `.gitkeep` placeholders so Git retains the scaffold.
- S-02 is not fully complete until the mobile app and API run locally after S-05 and S-06.
- S-05: Complete. Dependencies and the root lockfile are installed; the user confirmed QueueCare opens in Expo Go on a phone. TypeScript, lint, and the original app smoke test pass.
- S-12: Implemented. Root, patient, and staff navigation, typed entity parameters, guest sign-in gates, and a session integration contract are in place. Automated navigation tests and Android/iOS Metro exports pass; the new flows still need a phone smoke test. See [navigation handoff](NAVIGATION.md).
- S-06/S-07: Minimal Express startup and MongoDB connection implemented to support M1-04. Health and hospital queries are tested with a temporary local MongoDB instance. Persistent development database setup remains a local prerequisite. See [API setup](../apps/api/README.md).
- S-08/S-09: Hospital/service/session collection indexes and explicit, repeatable fictional discovery/session seeds are implemented. Users and other collections remain pending for their owners; staff session writes remain Member 3’s work.
- S-17: JWT verification and role authorization implemented as the M1-10 prerequisite, with current database account checks. Login/token issuance, patient/staff authentication flows, and mobile token storage remain pending for their owners. See [auth handoff](BOOKING_API.md).
- S-16: Shared backend error handler implemented, including standard validation, not-found, unavailable-database, and unexpected-error responses.
- S-10/S-11: Started only as needed for Member 1’s entry screens: the README palette and basic typography/spacing tokens are centralized, with a reusable action button and brand mark. The broader shared design system remains pending for its assigned owners.
- S-13: Pending. No token storage or real session validation exists. Member 1’s Home adapter can consume a JWT supplied in memory by the future authentication provider.
- M1-01: In-app Splash UI and asynchronous startup/recovery logic implemented and tested. The default loader explicitly returns a signed-out session; real session restoration and prototype fidelity checks remain pending.
- M1-02: Welcome UI and Get Started / Existing Account / Guest navigation implemented and tested. Prototype comparison and phone visual checks remain pending. See [startup handoff](STARTUP.md).

- M1-03: Patient Home frontend and authenticated next-appointment API adapter implemented. Guest browsing, loading/error/empty states, quick actions, retry, refresh, and booking-detail navigation pass local tests. Real API/authentication integration, prototype comparison, and phone checks remain pending. See [Patient Home handoff](PATIENT_HOME.md).
- M1-04: Hospital search API implemented and tested against real temporary MongoDB over HTTP. Supports active-only name/city search, pagination, public response fields, and validation. See [hospital API contract](API.md).
- M1-05: Hospital Search screen and public API adapter implemented. Guest/patient browsing, submitted name/city filters, result cards, ID navigation, loading/empty/error states, retry, refresh, and pagination are tested. Physical phone-to-API testing and matching prototype comparison remain pending. See [Hospital Search handoff](HOSPITAL_SEARCH.md).
- M1-06: Hospital details and active OPD services endpoints implemented with strict hospital-ID validation, public fields, missing/inactive hospital handling, service indexing and repeatable service seeds. All 27 API tests pass using temporary MongoDB. See [Hospital Details handoff](HOSPITAL_DETAILS.md).
- M1-07: Hospital Details screen and public adapters implemented, with service selection, validated hospital/service IDs passed to the next route, loading/empty/error/unavailable states, retry and refresh. All 102 mobile tests, TypeScript, and lint pass. Actual opening-hours data, mobile session availability integration, phone testing, and visual acceptance remain pending. See [Hospital Details handoff](HOSPITAL_DETAILS.md).
- M1-08: Available Sessions API implemented with date/service filters, active hospital/service checks, future OPEN sessions, remaining capacity and bookability, session indexing, and repeatable demo seeds. All 38 API tests pass using temporary MongoDB. See [session setup and handoff](SESSIONS.md).
- M1-09: Book Appointment screen and validated session adapter implemented. Date selection, capacity, single-session selection, patient-summary handoff, guest gate, loading/empty/error/unavailable states, retry, refresh, and stale-request handling are covered by 138 passing mobile tests. TypeScript, lint, and Android/iOS exports pass. M1-11/M1-12 now supply confirmation; real authentication/profile loading, phone testing, and visual acceptance remain pending. See [Book Appointment handoff](BOOK_APPOINTMENT.md).
- M1-10: Protected booking creation, all-status patient/session uniqueness, unique booking codes, transaction-capable database checks, and atomic capacity/booking writes implemented. All 50 API tests pass, including real replica-set concurrency, rollback, authentication, and eligibility-race cases. Actual login/token issuance remains pending; M1-11 now integrates the mobile action. See [Booking API handoff](BOOKING_API.md).
- M1-11: Confirm Appointment now sends authenticated booking creation, validates the saved response, handles full/unavailable/duplicate/authentication/uncertain results, prevents repeated submissions, and replaces the form with confirmation using the persisted ID. All 181 mobile tests, TypeScript, lint, and Android/iOS exports pass. Real authentication and phone acceptance remain pending. M1-10/M1-11 are merged through PR #18. See [confirmation integration](CONFIRM_APPOINTMENT.md).
- M1-12: Full Booking Confirmation screen and patient-owned booking-summary GET implemented. Shows saved code, hospital/service, Asia/Colombo date/time, team, and current statuses; handles loading, errors, refresh, inactive parents, expired sign-in, and stale requests. All 218 mobile and 57 API tests, TypeScript, lint, and Android/iOS exports pass. See [the confirmation handoff](BOOKING_CONFIRMATION.md). These changes are local and uncommitted; real-authentication phone and visual acceptance remain pending.
- M1-13: Booking-confirmed notification creation implemented using the README notification schema. Booking, capacity, and unread notification commit together; failed attempts roll back all writes, and retries/duplicate requests cannot add a second confirmation. All 61 API tests pass, including forced notification-write failure and transient retry. Member 4’s M4-06/M4-07 and I-03 end-to-end acceptance remain pending; this implements the creation side only. Changes are local and uncommitted. See [notification handoff](BOOKING_NOTIFICATIONS.md).
- The Member 1/develop merges through M1-11 are complete in local history (PR #18). The merged hospital prototype is available at `opd-high-fidelity-screens-square.html`; visual acceptance remains pending.

## Workspaces

| Directory | Package | Purpose |
| --- | --- | --- |
| `apps/mobile` | `@queuecare/mobile` | React Native / Expo Go app, initialized in S-05 by Member 1 |
| `apps/api` | `@queuecare/api` | Express/MongoDB API; minimal foundation added with M1-04, shared foundation ownership remains with Member 3 |
| `packages/shared` | `@queuecare/shared` | Shared types, constants, and enums |

From the repository root, verify that npm recognizes all three workspaces:

```bash
npm pkg get name --workspaces
```

Install dependencies from the repository root once they are introduced. Add dependencies to the appropriate workspace using `npm install <package> --workspace apps/mobile` (or `apps/api` or `packages/shared`). Keep the resulting root `package-lock.json` in Git.

The mobile and API manifests define their runtime dependencies and scripts. The shared package remains a scaffold. Install from the root and use `npm run dev:mobile` and `npm run dev:api` in separate terminals.

## Member 1's next implementation task

The next independent Member 1 implementation is **M1-14: accessibility refinements** across M1-03..M1-12 (labels, touch targets, text scaling, contrast, and loading/error announcements). M1-13's booking-event producer is implemented; Member 4 must still connect notification listing/read APIs and live screen data before I-03 can be accepted end to end. M1-12 and M1-13 remain local changes. Real login/token issuance and profile loading, Member 2's booking-list/details screens, and phone acceptance remain pending. Opening-hours data and S-13 (shared API client/token storage) are still incomplete. See the [notification handoff](BOOKING_NOTIFICATIONS.md) and [confirmation phone checklist](BOOKING_CONFIRMATION.md).
