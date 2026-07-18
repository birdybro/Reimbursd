# Agent Handoff

## Repository state

Milestones 0 through 3 are complete. Receipt ingestion has working camera/image/PDF selection,
decoded content validation, configurable limits, local SHA-256, global duplicate detection,
immutable private file storage, versioned document metadata, original-file provenance UI, and
durable attachment cleanup after receipt deletion. JPEG and PNG imports also receive bounded,
separately stored local previews. The web runtime loads both the application and Expo SQLite's WASM
worker successfully. Milestone 3 has durable processing provenance, a bounded Apple Vision OCR
adapter for supported iOS builds, deterministic local receipt-field parsing, atomic unaccepted
evidence persistence, and a review surface with confidence, provenance, and image source-region
highlighting. Review prefills the validated expense form and atomically commits accepted evidence,
authoritative user corrections, the versioned receipt update, and parser review status.

## Active direction

Use npm workspaces, strict TypeScript, Expo SDK 57, and framework-independent domain/database
packages. Milestone 4 is active. Category/tag domain records, migration 6, and local repositories are
implemented with UUIDs, normalized unique names, optimistic versions, tombstones, and explicit
in-use deletion errors. Expense details can create and atomically assign one category plus multiple
tags; removed relationships are tombstoned and re-addition revives the stable key. The expense list
now composes validated local merchant, date, currency-specific amount, category, and active-tag
filters through parameterized queries. A transactional read repository and accessible reports route
show monthly and category totals while keeping currencies separate and deleted receipts excluded.
CSV export is implemented through deterministic domain serialization, direct web download, and
native temporary-file sharing with cleanup. Complete structured export is also implemented: one
SQLite transaction reads the active record graph, a framework-independent package validates
relationships and deterministic JSON, record files receive SHA-256 manifest entries, and selected
originals must match stored byte-size and hash metadata before being copied into the plain ZIP. The
mobile export menu offers complete ZIP or CSV, with an explicit originals toggle, direct web
download, native temporary sharing, and failure cleanup. Format version 1 is documented in
`docs/DATA_EXPORT_FORMAT.md`. Clean-install restore is implemented: the framework-independent parser
rejects unsafe or unsupported ZIPs and validates the complete current-schema graph and checksums
before writes; the mobile coordinator requires all original bytes, uses immutable storage with
conflict detection and compensating cleanup, and inserts exact records through one SQLite
transaction only when every local application table is empty. Derivative previews are excluded from
format version 1 and can be regenerated later. Complete local data deletion is the next Milestone 4
task. Keep existing receipts valid and local, and do not add hosted processing, synchronization, or
generative AI.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Finish the highest-priority unchecked Milestone 4 task.
4. Run `npm run verify` before committing a logical slice or marking a milestone complete.
