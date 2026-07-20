# Architecture Decisions

| ADR                                                        | Status   | Decision                                                                         |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| [0001](adr/0001-workspace-and-mobile-foundation.md)        | Accepted | Use npm workspaces, strict TypeScript, Expo, and a framework-free domain package |
| [0002](adr/0002-local-sqlite-repository.md)                | Accepted | Use versioned local SQLite behind a portable asynchronous repository port        |
| [0003](adr/0003-local-attachment-storage.md)               | Accepted | Preserve originals in private file storage behind a validated ingestion boundary |
| [0004](adr/0004-processing-provenance-and-ocr-boundary.md) | Accepted | Validate OCR output and persist reviewable provenance without raw errors         |
| [0005](adr/0005-apple-vision-local-ocr.md)                 | Accepted | Use a local Apple Vision adapter and reject telemetry-bearing OCR SDKs           |
| [0006](adr/0006-deterministic-receipt-parser.md)           | Accepted | Parse validated OCR deterministically into reviewable local field evidence       |
| [0007](adr/0007-local-category-and-tag-storage.md)         | Accepted | Store versioned local categories, tags, and explicit assignment tombstones       |
| [0008](adr/0008-local-csv-export-delivery.md)              | Accepted | Serialize exact local CSV and deliver it through platform-controlled files       |
| [0009](adr/0009-structured-export-archive.md)              | Accepted | Validate an atomic snapshot into a versioned plain ZIP with optional originals   |
| [0010](adr/0010-clean-local-archive-restore.md)            | Accepted | Strictly validate and restore complete archives only into clean local storage    |
| [0011](adr/0011-durable-local-data-deletion.md)            | Accepted | Persist delete-all intent, finish file cleanup, then atomically purge user data  |
| [0012](adr/0012-authenticated-encrypted-backup.md)         | Accepted | Wrap complete exports with AES-GCM and a portable random recovery key            |
| [0013](adr/0013-self-hosted-api-authorization-boundary.md) | Accepted | Require owner-scoped API operations behind validated signed bearer identities    |
| [0014](adr/0014-owner-scoped-postgresql-persistence.md)    | Accepted | Persist hosted receipts through transactional owner-scoped PostgreSQL operations |
