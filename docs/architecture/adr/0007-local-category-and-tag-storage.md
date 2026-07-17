# ADR-0007: Local category and tag storage

- Status: Accepted
- Date: 2026-07-17

## Context

Milestone 4 needs user-defined categories and tags without an account or network dependency. These
records will eventually participate in optional synchronization, so identity reuse, silent deletion,
and ambiguous assignment state would create avoidable conflicts. Existing receipts already contain
a nullable `category_id` and must remain valid through the schema upgrade.

## Decision

Define framework-independent category and tag records with UUIDs, normalized names, timestamps,
optimistic versions, and deletion tombstones. Keep normalized names unique even after deletion so a
deleted synchronized identity is not silently replaced by a different record with the same name.

SQLite migration 6 adds `categories`, `tags`, and a versioned `receipt_tags` relationship table.
Existing receipt rows are not rewritten, and a null `category_id` remains valid. Repository reads
exclude tombstones, renames require an expected version, and normalized duplicate names are rejected.
An assigned category or tag cannot be deleted until it is explicitly unassigned from active receipts.
Replace a receipt's category and complete tag set through one optimistic repository transaction.
Increment the receipt version, tombstone removed tag relationships, and revive re-added relationships
using the existing receipt/tag key.

## Consequences

Categories and tags persist locally and expense details can create and assign them without a network
service. The restrictive deletion rule preserves receipt meaning and avoids hidden bulk edits. Name
reuse after deletion is intentionally unavailable in this first slice; a future restore or purge
workflow can make that lifecycle explicit. Versioned relationship tombstones preserve deterministic
remove/re-add behavior for later offline synchronization.
