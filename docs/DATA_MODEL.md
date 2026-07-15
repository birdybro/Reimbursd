# Data Model

## Current implementation

The domain package currently defines money parsing and formatting rules. Stored monetary values
will use integer minor units; floating-point values are not accepted as persistence inputs.

No receipt database schema is implemented in Milestone 0.

## Milestone 1 receipt record

The first local schema will use stable UUIDs, ISO 4217 currency codes, integer minor-unit amounts,
separate purchase and capture timestamps, record versions, updated timestamps, and deletion
tombstones. Manual records will retain manual provenance. The SQLite migration and exact schema
will be documented when implemented and tested.

Later schemas will add immutable original attachment metadata, merchants, locations, field
evidence, processing history, categories, tags, and optional line items without weakening the
local-only workflow.
