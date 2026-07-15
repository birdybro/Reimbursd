# Architecture

## Current system

Reimbursd is an npm workspace using strict TypeScript.

```text
apps/mobile       Expo and React Native client
packages/domain   Framework-independent business rules
```

The domain package cannot depend on React, React Native, HTTP frameworks, database drivers, cloud
SDKs, or billing providers. Applications may depend on domain packages, never the reverse.

The current mobile application has no network dependency and no account boundary. Milestone 1 will
introduce SQLite behind a local repository interface. Schema validation will be applied at storage,
import, provider, and network boundaries as those boundaries are introduced.

## Intended growth

Future work may add `apps/web`, `apps/api`, `apps/worker`, and focused packages for schemas,
database access, cryptography, providers, and synchronization. These are not implemented and are
not required for local mobile use.

See [ADR-0001](architecture/adr/0001-workspace-and-mobile-foundation.md) for the initial decision.
