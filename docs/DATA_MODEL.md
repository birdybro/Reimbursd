# Data Model

## Current implementation

The domain package defines money parsing, formatting, receipt construction, date normalization, and
receipt validation. Persisted monetary values use nonnegative safe integer minor units;
floating-point values are not accepted at the persistence boundary.

## Local SQLite schema

Migration `1` creates `schema_migrations`, `merchants`, and `receipts`. Migration `2` creates
`receipt_documents`, migration `3` adds explicit document capture/import provenance, and migration
`4` adds durable attachment-deletion state.

`merchants` stores a stable UUID, display and normalized names, optional website and phone columns,
and creation/update timestamps. The normalized name is unique so repeated manual entries can reuse
the same merchant record.

`receipts` stores:

```text
id, merchant_id, location_id, purchased_at, captured_at, currency_code,
subtotal_minor, tax_minor, tip_minor, discount_minor, total_minor,
category_id, source_type, notes, created_at, updated_at, version, deleted_at
```

Receipt and merchant identifiers are UUIDs. Purchase and capture timestamps are separate ISO 8601
values with timezone information. Currency codes are limited to the currently supported ISO 4217
set. `source_type` is `manual` for this slice. Amount and total-consistency constraints are enforced
in both the domain and database. Updates increment `version`; deletes set `deleted_at` and retain a
tombstone. Active reads exclude tombstones.

Migrations run transactionally and are recorded only after their schema changes succeed. Repository
tests cover reopening a file database, rollback, literal merchant search, currency filtering,
optimistic conflicts, and deletion behavior.

`receipt_documents` stores:

```text
id, receipt_id, parent_document_id, storage_reference, original_filename,
mime_type, byte_size, sha256, page_count, width_pixels, height_pixels,
is_original, created_at, source_type, storage_deleted_at
```

The table contains no file BLOBs. Original documents are insert-only through the repository,
storage references are unique, and duplicate original hashes are detected across the local data
set. JPEG and PNG records have one page plus decoded pixel dimensions. PDF records preserve a
positive page count and do not treat a whole document as having one image dimension. A derivative
must reference an original on the same receipt and has a distinct metadata row. Source type records
camera capture, image import, PDF import, or derivative generation.

Current JPEG and PNG derivatives are locally generated previews bounded to 1,600 pixels per side,
2,560,000 pixels, and 5 MiB. They carry their own hash, dimensions, storage reference, and deletion
state; the parent original metadata and bytes are unchanged.

When its receipt is tombstoned, a document with a null `storage_deleted_at` is pending physical file
cleanup. The timestamp is set only after the storage adapter reports successful, idempotent removal.
Document metadata remains attached to the receipt tombstone for integrity and future synchronization
semantics; active receipt queries do not expose it.

Later schemas will add locations, field evidence, processing history, categories, tags, optional
line items, and delete-all tracking without weakening the local-only workflow. The current nullable
category and location references are reserved fields, not complete features.
