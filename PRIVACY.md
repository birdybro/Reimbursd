# Privacy

Reimbursd is designed to keep its core mobile experience local and usable without an account.

## Current implementation

Manual expense fields are stored in a local SQLite database. On mobile, the database is inside the
application sandbox. On web, it is stored for the current browser origin and profile. The database
is not application-layer encrypted, and backup and restore are not implemented yet.

The application does not request location, use analytics, display advertising, transmit expense
data to a Reimbursd service, or require an account. It has no external AI, synchronization, hosted
processing, receipt-file ingestion, or telemetry integration. Deleting an expense retains a local
tombstone for future synchronization semantics; there is not yet a delete-all workflow.

## Product commitments

Future local receipt features will work without a hosted account. External AI, synchronization,
and location enrichment will be optional, explicit, and documented with the data transmitted and
retention behavior. Receipt contents and identifying expense details must not appear in telemetry
or logs.

Privacy issues can be reported using the private process in [SECURITY.md](SECURITY.md).
