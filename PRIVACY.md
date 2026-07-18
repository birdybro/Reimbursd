# Privacy

Reimbursd is designed to keep its core mobile experience local and usable without an account.

## Current implementation

Expense fields and receipt-file metadata are stored in local SQLite. Original JPEG, PNG, and PDF
bytes are stored separately in private application documents on mobile or origin-private browser
file storage on web. Originals are hashed and copied without modification. JPEG and PNG previews
are resized and encoded locally as separate derivatives in the same private storage boundary.
These stores are not application-layer encrypted. Plain structured export and clean-install restore
are implemented; authenticated encrypted backup is not.

The application does not request location, use analytics, display advertising, transmit expense
or receipt data to a Reimbursd service, or require an account. On iOS development and release
builds, imported image derivatives can be processed on-device with Apple Vision. The processing
copy is removed from private cache after the attempt, recognized text remains transient, and only
bounded lifecycle status is currently persisted. Android, web, and Expo Go do not run OCR. The
application has no external AI,
synchronization, hosted processing, or telemetry integration. Camera and photo-library permissions
are requested only after the corresponding local import action. PDF selection does not request
camera, photo, or location access.

CSV export is an explicit local action. Web creates a browser download without uploading the file.
Native builds write the CSV to private cache, open the operating-system share sheet, and remove the
temporary cache file after the share attempt. A destination selected in the browser or share sheet
is outside Reimbursd's private storage and follows that destination's retention behavior. CSV is
plain text and is not described as encrypted.

Complete structured export is also an explicit local action. The application reads one active-data
snapshot from SQLite and includes original receipt files only when the user leaves that option
enabled. Each included original is read from private local storage, verified against its recorded
byte size and SHA-256, and copied byte-for-byte into a plain ZIP. Web downloads the ZIP locally;
native builds remove the private temporary ZIP after the share attempt. The destination controls
the exported copy's retention. The ZIP is not encrypted.

Structured restore is an explicit local action. Reimbursd receives the user-selected ZIP through the
platform picker, validates its format, schema, paths, record relationships, limits, byte sizes, and
SHA-256 checksums before writing application data, and makes no Reimbursd network request. Restore
accepts only an empty local database and a complete export containing every referenced original.
Original bytes are written immutably; a failed structured-data transaction removes files created by
that attempt, while an interrupted retry may reuse only an existing byte-identical file. The source
selected through the browser or operating-system picker follows that source's own storage and
network behavior.

Deleting an expense retains a metadata tombstone for future synchronization semantics, then removes
its local receipt bytes. If byte removal fails or the application closes between these operations,
the durable document state is retried at startup and can be retried from the expense list.

Delete-all requires a separate explicit confirmation. The application first records a durable
deletion intent and hides every active receipt, then removes each receipt file through the same
idempotent cleanup path. While deletion is pending, new receipts and documents are blocked and the
application shows only a retry surface. After every file is reported removed, one SQLite transaction
purges merchants, receipts, documents, evidence, processing history, categories, tags, and
relationships. Migration metadata remains so the empty database can still be opened safely. This is
complete deletion from Reimbursd's active local stores, but it is not a forensic secure-erasure
guarantee for SQLite pages, flash storage, browser profiles, operating-system backups, exported
copies, or previously selected share destinations.

## Product commitments

Future local receipt features will work without a hosted account. External AI, synchronization,
and location enrichment will be optional, explicit, and documented with the data transmitted and
retention behavior. Receipt contents and identifying expense details must not appear in telemetry
or logs.

Privacy issues can be reported using the private process in [SECURITY.md](SECURITY.md).
