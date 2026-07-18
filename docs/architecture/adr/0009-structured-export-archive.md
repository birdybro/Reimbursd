# ADR 0009: Structured Export Archive

- Status: Accepted
- Date: 2026-07-18

## Context

Milestone 4 requires an open complete-data export with optional byte-identical originals. Records
span several SQLite tables while attachment bytes live outside the database. The format needs stable
versioning and integrity metadata without claiming encryption or restore support prematurely.

## Decision

Read active export records through one SQLite transaction and pass the resulting relationship graph
to a framework-independent export package. Validate all domain records, identifiers, relationships,
attachment counts, byte sizes, and recorded SHA-256 hashes before creating the archive.

Use a deterministic plain ZIP with versioned `manifest.json`, stable JSON record files,
`checksums.txt`, and optional originals. Derive attachment paths from document UUIDs and validated
MIME types; retain user filenames only as metadata. Use `fflate`, an MIT-licensed in-process ZIP
implementation, and the existing platform SHA-256 adapter. Deliver through direct browser download
or a native temporary file and operating-system share sheet. Do not claim restore or encryption.

## Consequences

- Export requires no account, hosted service, network request, or duplicate attachment storage.
- A selected original whose bytes no longer match SQLite metadata prevents a misleading archive.
- Deleted records and tombstones are outside format version 1; restore work must define collision,
  rollback, and clean-install rules before it is exposed.
- Plain exported copies inherit the security and retention behavior of the user-selected destination.
