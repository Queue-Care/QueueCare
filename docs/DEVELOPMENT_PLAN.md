# Foundation setup

The task definitions and ownership remain in the root README.

## Current status

- S-01: The local repository has an origin at `https://github.com/Queue-Care/QueueCare.git` and local `main` and `develop` branches. Remote branch protection and required PR review have not been verified.
- S-02: The repository folders and npm workspace manifests are configured. Empty directories contain `.gitkeep` placeholders so Git retains the scaffold.
- S-02 is not fully complete until the mobile app and API run locally after S-05 and S-06.
- S-05: Complete. Dependencies and the root lockfile are installed; the user confirmed QueueCare opens in Expo Go on a phone. TypeScript, lint, and the original app smoke test pass.
- S-12: Implemented. Root, patient, and staff navigation, typed entity parameters, guest sign-in gates, and a session integration contract are in place. Automated navigation tests and Android/iOS Metro exports pass; the new flows still need a phone smoke test. See [navigation handoff](NAVIGATION.md).
- S-06/S-07: Minimal Express startup and MongoDB connection implemented to support M1-04. Health and hospital queries are tested with a temporary local MongoDB instance. Persistent development database setup remains a local prerequisite. See [API setup](../apps/api/README.md).
- S-08/S-09: Hospital collection indexes and an explicit, repeatable fictional hospital seed are implemented. Collections/indexes/seeds for services, sessions, users, and other features remain pending for their owners.
- S-16: Shared backend error handler implemented, including standard validation, not-found, unavailable-database, and unexpected-error responses.
- S-10/S-11: Started only as needed for Member 1’s entry screens: the README palette and basic typography/spacing tokens are centralized, with a reusable action button and brand mark. The broader shared design system remains pending for its assigned owners.
- S-13: Pending. No token storage or real session validation exists. Member 1’s Home adapter can consume a JWT supplied in memory by the future authentication provider.
- M1-01: In-app Splash UI and asynchronous startup/recovery logic implemented and tested. The default loader explicitly returns a signed-out session; real session restoration and prototype fidelity checks remain pending.
- M1-02: Welcome UI and Get Started / Existing Account / Guest navigation implemented and tested. Prototype comparison and phone visual checks remain pending. See [startup handoff](STARTUP.md).

- M1-03: Patient Home frontend and authenticated next-appointment API adapter implemented. Guest browsing, loading/error/empty states, quick actions, retry, refresh, and booking-detail navigation pass local tests. Real API/authentication integration, prototype comparison, and phone checks remain pending. See [Patient Home handoff](PATIENT_HOME.md).
- M1-04: Hospital search API implemented and tested against real temporary MongoDB over HTTP. Supports active-only name/city search, pagination, public response fields, and validation. See [hospital API contract](API.md).

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

The next Member 1 implementation is **M1-05: Hospital Search screen**, consuming M1-04 with search/loading/empty/error states and hospital navigation. S-13 (shared API client/JWT handling) is still incomplete; the public search endpoint can support guest discovery while that shared work proceeds. Hospital details (M1-06/M1-07) follow. Continue phone checks and prototype comparison, and connect M1-03 to Member 2’s authentication and booking-list implementation when available. The full assessed flow is not yet complete.
