# Architecture

## Current system

Reimbursd is an npm workspace using strict TypeScript.

```text
apps/mobile       Expo and React Native client
packages/domain   Framework-independent business rules
packages/database SQLite ports, migrations, and receipt repository
```

The domain package cannot depend on React, React Native, HTTP frameworks, database drivers, cloud
SDKs, or billing providers. Applications may depend on domain packages, never the reverse.

The current mobile application has no network dependency and no account boundary. It opens Expo
SQLite through an application adapter and passes a small asynchronous SQLite connection port to the
shared database package. The database package owns migrations and repository behavior; its tests
run against Node's real SQLite implementation. Domain validation is reapplied when records cross
the repository boundary.

The receipt repository uses transactions for multi-table writes, parameterized statements,
optimistic record versions, and deletion tombstones. UI code depends on the repository interface,
not Expo SQLite directly. No attachment, hosted, synchronization, or provider boundary exists yet.

## Intended growth

Future work may add `apps/web`, `apps/api`, `apps/worker`, and focused packages for schemas,
database access, cryptography, providers, and synchronization. These are not implemented and are
not required for local mobile use.

See [ADR-0001](architecture/adr/0001-workspace-and-mobile-foundation.md) and
[ADR-0002](architecture/adr/0002-local-sqlite-repository.md) for accepted decisions.
