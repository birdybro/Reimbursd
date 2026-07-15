# Privacy

Reimbursd is designed to keep its core mobile experience local and usable without an account.

## Current implementation

Expense fields and receipt-file metadata are stored in local SQLite. Original JPEG, PNG, and PDF
bytes are stored separately in private application documents on mobile or origin-private browser
file storage on web. Originals are hashed and copied without modification. These stores are not
application-layer encrypted, and backup and restore are not implemented yet.

The application does not request location, use analytics, display advertising, transmit expense
or receipt data to a Reimbursd service, or require an account. It has no external AI,
synchronization, hosted processing, or telemetry integration. Camera and photo-library permissions
are requested only after the corresponding local import action. PDF selection does not request
camera, photo, or location access.

Deleting an expense retains a metadata tombstone for future synchronization semantics, then removes
its local receipt bytes. If byte removal fails or the application closes between these operations,
the durable document state is retried at startup and can be retried from the expense list. A
delete-all workflow and secure deletion guarantees are not implemented, so this development build
must not claim complete data deletion or forensic erasure.

## Product commitments

Future local receipt features will work without a hosted account. External AI, synchronization,
and location enrichment will be optional, explicit, and documented with the data transmitted and
retention behavior. Receipt contents and identifying expense details must not appear in telemetry
or logs.

Privacy issues can be reported using the private process in [SECURITY.md](SECURITY.md).
