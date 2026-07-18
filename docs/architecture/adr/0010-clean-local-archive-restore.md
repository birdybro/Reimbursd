# ADR 0010: Clean Local Archive Restore

- Status: Accepted
- Date: 2026-07-18

## Context

Format version 1 exports combine relational records with immutable files stored outside SQLite.
Restore input is untrusted and may be malformed, oversized, internally inconsistent, or constructed
to escape the intended archive paths. SQLite and platform file storage cannot share one transaction,
and silently merging stable IDs into existing local data could overwrite user work.

## Decision

Parse the complete ZIP in the framework-independent export package before any local write. Allow
only the exact format version 1 file graph, bound compressed and expanded resources, strictly parse
the current database schema, verify manifest metadata and SHA-256 checksums, and revalidate domain
records and relationships. Reject nonempty location and line-item files until those models exist.

Restore only to an empty local database and never merge. Require every exported receipt document to
be an original with matching attachment bytes. Exclude derivative records from format version 1
because their bytes are regenerable and partial restoration would leave invalid storage references.

Write originals through immutable platform storage before inserting the record graph in one SQLite
transaction. Track files created by the attempt and remove them in reverse order after failure. To
recover from an interruption during cleanup, reuse an existing target only when it is byte-identical
to the validated archive; reject every conflict.

## Consequences

- Invalid archives fail before changing application data.
- Existing local structured data is never overwritten or silently combined with imported IDs.
- SQLite rollback is atomic, while file coordination is compensating and explicitly retryable rather
  than represented as a cross-storage transaction.
- A record-only export containing receipt documents remains useful for inspection but cannot restore
  those receipts. Archives with no document records can restore without attachments.
- Restore supports only the current schema and explicitly reviewed record-compatible prior schemas;
  every future schema change requires an intentional compatibility decision.
- Plain ZIP restore does not add encryption or change the source file's retention behavior.
