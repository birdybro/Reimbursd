# Data Export Format

## Expense CSV

Expense CSV export is implemented. It creates a UTF-8 plain-text file named
`reimbursd-expenses-YYYY-MM-DD.csv` with CRLF line endings and these columns:

```text
receipt_id, merchant_id, merchant_name, purchased_at, captured_at, currency_code,
subtotal, tax, tip, discount, total, category_id, location_id, notes,
source_type, created_at, updated_at, version
```

Only active receipts are included. Rows are ordered by descending purchase timestamp and then stable
receipt ID. Monetary values are derived directly from integer minor units using the currency's
supported decimal precision; no floating-point calculation is used. Empty category and location IDs
are empty cells. Quotes, commas, and newlines are RFC-style quoted. User-entered merchant and note
values beginning with a spreadsheet formula prefix after whitespace receive a leading apostrophe.

Web starts a local browser download. Native builds use a private temporary cache file and the system
share sheet, then remove the cache file after the share attempt. The resulting CSV is not encrypted.

## Complete structured export

Complete structured export is implemented as a ZIP file named
`reimbursd-export-YYYY-MM-DD.zip`. Format version 1 contains:

```text
manifest.json
receipts.json
merchants.json
locations.json
line-items.json
categories.json
tags.json
receipt-tags.json
receipt-documents.json
field-evidence.json
processing-history.json
checksums.txt
attachments/                 optional
```

Every JSON record file contains one top-level array. JSON is UTF-8, two-space indented, newline
terminated, and emitted with recursively sorted object keys. Array order is stable for one database
snapshot. `locations.json` and `line-items.json` are currently empty because those local models are
not implemented; keeping the files present reserves their documented names without claiming the
features exist.

Only active receipts are exported. Categories and tags include active records. Merchants,
receipt-tag relationships, original document metadata, field evidence, and processing history are
included only when they belong to active receipts; storage-deleted documents and regenerable
derivatives are excluded. Tombstones are not part of format version 1.
`receipt-documents.json` adds `attachmentPath`: the archive path for an included original, or `null`
when its bytes are not included. The original filename remains metadata and is never used as an
archive path.

### Manifest

`manifest.json` has this shape:

```json
{
  "applicationVersion": "0.1.0",
  "createdAt": "2026-07-18T13:00:00.000Z",
  "files": [
    {
      "byteSize": 3,
      "kind": "records",
      "path": "receipts.json",
      "recordCount": 0,
      "sha256": "...64 lowercase hexadecimal characters..."
    },
    {
      "byteSize": 12345,
      "documentId": "00000000-0000-4000-8000-000000000000",
      "kind": "attachment",
      "mimeType": "image/jpeg",
      "originalFilename": "receipt.jpg",
      "path": "attachments/00000000-0000-4000-8000-000000000000.jpg",
      "sha256": "...64 lowercase hexadecimal characters..."
    }
  ],
  "format": "reimbursd-export",
  "formatVersion": 1,
  "includesOriginalAttachments": true,
  "schemaVersion": 6
}
```

Record-file entries contain `recordCount`; attachment entries contain document metadata needed to
associate the file with `receipt-documents.json`. `files` is sorted by archive path. The application
rejects invalid records, unresolved relationships, duplicate IDs, missing selected originals,
unexpected attachment input, byte-size mismatches, and checksum mismatches before producing a ZIP.

### Attachments and checksums

The user can include or exclude originals. When included, supported originals use paths derived only
from the validated document UUID and MIME type:

```text
attachments/<document-id>.jpg
attachments/<document-id>.png
attachments/<document-id>.pdf
```

Each source file is verified against its SQLite byte size and SHA-256 metadata, then copied without
modification. Derivative previews are not included in format version 1. `checksums.txt` contains one
line per record file and included attachment, sorted by path:

```text
<lowercase-sha256><two spaces><archive-path>
```

`manifest.json` and `checksums.txt` are not self-listed. Consumers must treat all archive paths and
record contents as untrusted and validate them before restore.

### Restore validation

Reimbursd restores only format version 1 archives whose database schema version exactly matches the
running application. Before any local write, the parser rejects invalid ZIP data, duplicate or
unknown paths, absolute or traversal paths, unsupported compression, malformed or non-UTF-8 JSON,
unknown object properties, missing files, manifest/archive disagreement, unsupported location or
line-item records, invalid domain relationships, and any count, byte-size, or SHA-256 mismatch.

Default parse limits are 1 GiB for the archive and total expanded contents, 25 MiB per attachment,
32 MiB per record file, 10,012 entries, and 200 characters per path. These are defensive parser
ceilings, not a promise that every device can process an archive near the maximum.

Restore requires an empty local database and never merges with or overwrites existing structured
records. If document metadata is present, the export must include every original attachment;
record-only exports containing documents remain valid for inspection but cannot be restored.
Archives without any receipt documents do not require an `attachments/` directory. Structured
records are inserted in one SQLite transaction with their stable IDs, timestamps, versions,
classifications, evidence, and processing history intact.

The mobile coordinator also verifies before writing that each opaque document storage reference is
the canonical private target derived from its receipt UUID, document UUID, and validated MIME type.
This metadata is not allowed to redirect attachment writes to another local path.

Attachment bytes are written through immutable storage before the database transaction. If a later
write or transaction fails, files created by that attempt are removed in reverse order. A retry
after interrupted cleanup can reuse an existing target only when its bytes are identical; any
conflicting file fails closed. This provides recoverable local coordination without claiming one
atomic transaction across SQLite and platform file storage.

### Delivery and limitations

Web creates a local browser download. Native builds use a private temporary cache file and the
operating-system share sheet, then remove the cache file after the share attempt. No account or
network service is required by Reimbursd, although a user-selected share destination may use one.

The ZIP is plain and is not encrypted. Format version 1 supports inspection, data portability, and
clean-install restore in the current application schema. Encrypted backups are a separate
Milestone 5 capability requiring tested authenticated encryption.
