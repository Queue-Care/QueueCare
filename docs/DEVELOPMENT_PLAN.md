# Foundation setup

The task definitions and ownership remain in the root README.

## Current status

- S-01: The local repository has an origin at `https://github.com/Queue-Care/QueueCare.git` and local `main` and `develop` branches. Remote branch protection and required PR review have not been verified.
- S-02: The repository folders and npm workspace manifests are configured. Empty directories contain `.gitkeep` placeholders so Git retains the scaffold.
- S-02 is not fully complete until the mobile app and API run locally after S-05 and S-06.
- S-05: Complete. Dependencies and the root lockfile are installed; the user confirmed QueueCare opens in Expo Go on a phone. TypeScript, lint, and the original app smoke test pass.
- S-12: Implemented. Root, patient, and staff navigation, typed entity parameters, guest sign-in gates, and a session integration contract are in place. Automated navigation tests and Android/iOS Metro exports pass; the new flows still need a phone smoke test. See [navigation handoff](NAVIGATION.md).
- S-06/S-07/S-08: Pending. API entry files remain empty; no API or database implementation was found.
- S-10/S-11/S-13: Pending. Shared design components and authentication/API integration are not implemented.

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

Smoke-test the new S-12 routes in Expo Go using docs/NAVIGATION.md. The next Member 1 feature is M1-01 (the final Splash screen), which depends on Member 4’s S-10 shared theme and the auth-restoration integration from S-13. M1-02 (Welcome) follows. The high-fidelity HTML referenced by the README is not present in the repository, so prototype fidelity has not been verified. Hospital APIs follow S-08/S-16 and should wait for the shared backend foundation.
