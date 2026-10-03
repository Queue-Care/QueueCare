# Foundation setup

The task definitions and ownership remain in the root README.

## Current status

- Patient pages update: Welcome now follows supplied HTML screen 02. Create Account, My Bookings, Booking Details, Request Priority, and Request Status replace their navigation placeholders with frontend pages and API adapters (HTML screens 05 and 11–14). Registration validation, confirmed-booking cancellation confirmation, priority submission, and decision rendering are implemented on the client. Backend CRUD, real verification/session restoration, and phone fidelity verification remain pending. See [patient pages handoff](PATIENT_PAGES.md).

- S-01: The local repository has an origin at `https://github.com/Queue-Care/QueueCare.git` and local `main` and `develop` branches. Remote branch protection and required PR review have not been verified.
- S-02: The repository folders and npm workspace manifests are configured. Empty directories contain `.gitkeep` placeholders so Git retains the scaffold.
- S-02 is not fully complete until the mobile app and API run locally after S-05 and S-06.
- S-05: Complete. Dependencies and the root lockfile are installed; the user confirmed QueueCare opens in Expo Go on a phone. TypeScript, lint, and the original app smoke test pass.
- S-12: Implemented. Root, patient, and staff navigation, typed entity parameters, guest sign-in gates, and a session integration contract are in place. Automated navigation tests and Android/iOS Metro exports pass; the new flows still need a phone smoke test. See [navigation handoff](NAVIGATION.md).
- S-06/S-07/S-08: Pending. API entry files remain empty; no API or database implementation was found.
- S-10/S-11: Started only as needed for Member 1’s entry screens: the README palette and basic typography/spacing tokens are centralized, with a reusable action button and brand mark. The broader shared design system remains pending for its assigned owners.
- S-13: Pending. No token storage or real session validation exists. Member 1’s Home adapter can consume a JWT supplied in memory by the future authentication provider.
- M1-01: In-app Splash UI and asynchronous startup/recovery logic implemented and tested. The default loader explicitly returns a signed-out session; real session restoration and prototype fidelity checks remain pending.
- M1-02: Welcome UI and Get Started / Existing Account / Guest navigation implemented and tested. Prototype comparison and phone visual checks remain pending. See [startup handoff](STARTUP.md).

- M1-03: Patient Home frontend and authenticated next-appointment API adapter implemented. Guest browsing, loading/error/empty states, quick actions, retry, refresh, and booking-detail navigation pass local tests. Real API/authentication integration, prototype comparison, and phone checks remain pending. See [Patient Home handoff](PATIENT_HOME.md).

## Workspaces

| Directory | Package | Purpose |
| --- | --- | --- |
| `apps/mobile` | `@queuecare/mobile` | React Native / Expo Go app, initialized in S-05 by Member 1 |
| `apps/api` | `@queuecare/api` | Express API, initialized in S-06 by Member 3 |
| `packages/shared` | `@queuecare/shared` | Shared types, constants, and enums |

From the repository root, verify that npm recognizes all three workspaces:

```bash
npm pkg get name --workspaces
```

Install dependencies from the repository root once they are introduced. Add dependencies to the appropriate workspace using `npm install <package> --workspace apps/mobile` (or `apps/api` or `packages/shared`). Keep the resulting root `package-lock.json` in Git.

The mobile manifest now defines its React Native dependencies and scripts. API and shared package manifests still define workspace identities only; their runtime setup belongs to the corresponding owners.

## Member 1's next implementation task

Verify the new guest Home in Expo Go, then connect M1-03 to Member 2’s booking-list/authentication work and Member 3’s API/MongoDB foundation using docs/API.md. The next Member 1 implementation is M1-04 (hospital search API), dependent on S-08 (database) and S-16 (error handling), followed by M1-05 (Hospital Search screen). The backend remains empty, so M1-03’s live-data acceptance and those API prerequisites remain outstanding.
