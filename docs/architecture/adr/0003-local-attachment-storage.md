# ADR-0003: Local attachment storage

- Status: Accepted
- Date: 2026-07-15

## Context

Receipt originals must remain available offline, survive application restarts, retain their exact
bytes, and avoid relational BLOB storage. Mobile and web expose different private storage APIs.
Picker names and MIME values are untrusted, and a file/database write cannot be one atomic
transaction.

## Decision

Keep validation and ingestion coordination in `packages/attachments` behind ports for content
inspection, SHA-256, immutable byte storage, and document metadata. Store original bytes in Expo's
private application document directory on native platforms and the browser origin-private file
system on web. Store only metadata and generated opaque references in SQLite.

Recognize JPEG, PNG, and PDF from signatures, then use `pdf-lib` to decode images or parse PDFs.
Apply byte, page, dimension, and pixel-count limits before file persistence. Calculate SHA-256
locally and reject an already imported original before writing. Write the file before metadata; if
metadata persistence fails, remove the new file and surface both errors if cleanup also fails.
Never overwrite an existing storage reference.

Model originals and derivatives separately. A derivative must point to an original on the same
receipt and cannot replace the original. Camera, image-picker, and PDF-picker provenance is stored
on the original metadata row.

## Consequences

Core ingestion behavior is deterministic and testable without Expo. The browser and native use the
same domain and SQLite metadata contract while retaining platform-private bytes. Cross-store writes
need explicit compensation and cannot claim full atomicity. Current format support is limited to
JPEG, PNG, and unencrypted PDFs; other formats fail with a recoverable error. Storage is isolated by
the platform but is not application-layer encrypted. Generated preview creation and attachment
deletion retry remain follow-up work.
