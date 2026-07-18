# ADR 0011: Durable Local Data Deletion

- Status: Accepted
- Date: 2026-07-18

## Context

Delete-all must remove structured records and receipt files without an account or network service.
SQLite and platform file storage cannot share a transaction. Deleting database references first
would forget files after interruption, while deleting files first without durable intent could leave
the application appearing usable with partially missing receipts. New writes during cleanup could
also escape the set selected for deletion.

## Decision

Add a singleton `local_data_deletion` row in migration 7. Beginning deletion inserts that intent and
tombstones every active receipt in one SQLite transaction. While the row exists, SQLite triggers
reject new receipt and receipt-document inserts.

Reuse the existing idempotent attachment cleanup and per-document `storage_deleted_at` marker. A
framework-independent coordinator resumes cleanup on startup and exposes only completed or durable
pending states. Once no document remains pending, delete all user-data tables and the singleton
intent in one SQLite transaction. Retain `schema_migrations` so the empty database remains valid and
can receive a clean archive restore.

Keep format version 1 schema-6 archives explicitly compatible with schema 7 because the new table is
operational state and does not change exported record shapes. Require separate destructive
confirmation in the UI and block normal workflows while a deletion intent remains.

## Consequences

- An interruption cannot make the application forget which receipt files still require deletion.
- Mid-purge database failures roll back all table deletion and preserve a retryable intent.
- A completed operation leaves no Reimbursd user records or receipt files in active application
  storage and supports a clean restore.
- The operation does not erase exports, operating-system backups, SQLite remnants, browser profile
  history, or underlying flash blocks. It must not be described as forensic secure erasure.
