# Foundation setup

The task definitions and ownership remain in the root README.

## Current status

- S-01: The local repository has an origin at `https://github.com/Queue-Care/QueueCare.git` and local `main` and `develop` branches. Remote branch protection and required PR review have not been verified.
- S-02: The repository folders and npm workspace manifests are configured. Empty directories contain `.gitkeep` placeholders so Git retains the scaffold.
- S-02 is not fully complete until the mobile app and API run locally after S-05 and S-06.
- S-05: The mobile workspace is configured for React Native with Expo Go (SDK 57), following the team’s updated decision. It includes the QueueCare startup screen, Expo entry point, Metro/Babel/TypeScript configuration, run commands, and a smoke test. Dependency installation remains blocked by the network certificate error; successful checks and an Expo Go phone launch are pending. See [mobile setup](../apps/mobile/README.md).

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

Finish S-05 verification: resolve npm's network certificate error, install dependencies, run the mobile checks, and launch QueueCare in Expo Go on a physical phone. Then implement S-12 (navigation). M1-01 (Splash screen) also depends on S-10 (shared theme).
