# ADR-0004: Processing provenance and OCR boundary

- Status: Accepted
- Date: 2026-07-15

## Context

Receipt OCR text and provider responses are untrusted input. Extracted fields must remain visibly
separate from confirmed receipt values, retain source regions when available, and never overwrite a
user correction silently. Processing attempts also need durable lifecycle records without placing
receipt text, merchant names, totals, filenames, or raw provider errors in logs or error columns.

## Decision

Model field evidence and processing history in the framework-independent domain package. Use
normalized page coordinates from 0 through 1 for source rectangles. Rank user corrections, manual
values, and accepted suggestions above unreviewed automation when selecting preferred evidence.
Store each correction as provenance rather than mutating an automated suggestion into a user value.

Persist evidence and processing history in SQLite migration 5. A running processing record may be
completed exactly once. Store bounded failure codes instead of raw errors. Keep affected fields as a
validated JSON array because the set is small, ordered, and belongs to one immutable processing
event.

Put the common OCR provider port in `packages/ocr`, separate from future AI extraction providers.
Treat provider output as `unknown`; clone input bytes, enforce input limits, and validate page count,
block count, total text, confidence, and normalized boxes before returning typed output. Include a
deterministic local provider for contract and orchestration tests. It is not presented as real OCR.

## Consequences

Processing provenance survives restart and cannot persist arbitrary error messages through the
repository API. Provider implementations can vary without changing review or evidence semantics.
OCR output text is currently transient and has no production consumer; deterministic parsing,
production offline OCR, review UI, and source highlighting remain follow-up work. Remote processing
is still disabled and no receipt data crosses a network boundary.
