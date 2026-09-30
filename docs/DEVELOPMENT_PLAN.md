# Foundation setup

The task definitions and ownership remain in the root README.

## Current status

- S-01: The local repository has an origin at `https://github.com/Queue-Care/QueueCare.git` and local `main` and `develop` branches. Remote branch protection and required PR review have not been verified.
- S-02: The repository folders and npm workspace manifests are configured. Empty directories contain `.gitkeep` placeholders so Git retains the scaffold.
- S-02 is not fully complete until the mobile app and API run locally after S-05 and S-06.

## Workspaces

| Directory | Package | Purpose |
| --- | --- | --- |
| `apps/mobile` | `@queuecare/mobile` | React Native app, initialized in S-05 by Member 1 |
| `apps/api` | `@queuecare/api` | Express API, initialized in S-06 by Member 3 |
| `packages/shared` | `@queuecare/shared` | Shared types, constants, and enums |

From the repository root, verify that npm recognizes all three workspaces:

```bash
npm pkg get name --workspaces
```

Install dependencies from the repository root once they are introduced. Add dependencies to the appropriate workspace using `npm install <package> --workspace apps/mobile` (or `apps/api` or `packages/shared`). Keep the resulting root `package-lock.json` in Git.

The package manifests currently define workspace identities only. Runtime dependencies, entry points, and run scripts belong to the corresponding initialization tasks.

## Member 1's next implementation task

S-05: Initialize the React Native CLI application in `apps/mobile`, preserve the planned `src` directories, and verify it opens on an Android emulator or physical device. S-12 (navigation) and M1-01 (Splash screen) follow their README prerequisites.
