# Data Model

## Current implementation

The domain package defines money parsing, formatting, receipt construction, date normalization, and
receipt validation. Persisted monetary values use nonnegative safe integer minor units;
floating-point values are not accepted at the persistence boundary.

## Local SQLite schema

Migration `1` creates `schema_migrations`, `merchants`, and `receipts`.

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

Later schemas will add immutable original attachment metadata, locations, field evidence,
processing history, categories, tags, and optional line items without weakening the local-only
workflow. The current nullable category and location references are reserved fields, not complete
features.
