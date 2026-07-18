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

The versioned complete export and restore archive is planned for Milestone 4 and is not yet
implemented. It will contain structured JSON records, optional byte-identical original attachments,
and checksums. Plain exports will not be described as encrypted; encrypted backups are a separate
Milestone 5 capability requiring tested authenticated encryption.
