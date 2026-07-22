# Architecture

## Current system

Reimbursd is an npm workspace using strict TypeScript.

```text
apps/api          Fastify authorization-first development API
apps/mobile       Expo and React Native client
apps/web          React hosted-service development client
apps/worker       PostgreSQL-backed durable job worker
packages/attachments File inspection and attachment-ingestion coordination
packages/crypto   Authenticated backup framing and portable backup-key lifecycle
packages/domain   Framework-independent business rules
packages/database SQLite ports, migrations, and local repositories
packages/export   Validated deterministic structured archive creation and parsing
packages/extraction Validated deterministic receipt-field parsing
packages/ocr      Validated OCR provider contract and deterministic test provider
```

The domain package cannot depend on React, React Native, HTTP frameworks, database drivers, cloud
SDKs, or billing providers. Applications may depend on domain packages, never the reverse.

The first Milestone 6 server slice is an independent Fastify 5 application. It validates bounded
JSON requests with strict route schemas and Zod, publishes OpenAPI 3.1.1 from the same route
definitions, applies a global rate limit, and disables request logging and CORS. Protected routes
accept only an expiring HS256 bearer token with fixed issuer and audience claims plus a UUID subject.
Synthetic token issuance is registered only in explicit development mode and cannot be enabled by
production configuration.

The API-owned receipt repository port requires `ownerId` on every operation. The development
in-memory adapter stores an owner beside each receipt and returns `null` for both cross-owner and
absent reads, which the HTTP boundary maps to the same bounded response. A PostgreSQL 16 adapter now
implements the same contract with owner predicates in every query and mutation. UUID identifiers
remain globally unique, `BIGINT` money crosses an explicit safe-integer parser, and ISO 8601 receipt
timestamps remain bounded text so their source offset survives. Local mobile code has no import or
runtime dependency on the API.

Hosted migrations are immutable TypeScript data applied under a transaction-scoped advisory lock.
The runner rejects future versions and commits schema plus migration records atomically. PostgreSQL
is optional in development and required by production API configuration. Real-container tests cover
idempotence, rollback, restart persistence, concurrent conflict, safe numeric reads, and two-owner
isolation.

Hosted original attachments use a separate application-owned storage port backed by the official S3
client. Upload validates bounded base64 JSON, inspects the decoded JPEG, PNG, or PDF, derives the
object key only from owner/receipt/document UUIDs, hashes the bytes, and performs an immutable
conditional write before inserting owner-linked metadata. Metadata failure triggers object cleanup.
Download first resolves document metadata through owner and receipt predicates, then reads a bounded
stream and revalidates byte size plus SHA-256 before proxying bytes. Public and presigned object URLs
are not exposed. Configuration is all-or-nothing and requires PostgreSQL; real MinIO and PostgreSQL
tests cover private bucket policy, write-once behavior, resource limits, metadata ownership, and
cross-owner denial.

The worker is a separate optional Node.js process backed by `pg-boss` in a namespaced PostgreSQL
schema. It enables `LISTEN`/`NOTIFY` with polling fallback and bounds the initial readiness queue to
one locally concurrent job. Startup writes a versioned synthetic UUID job, validates unknown job data
through Zod at the handler boundary, and reaches readiness only when the handler receives that job.
Job and provider errors are reduced to stable codes at process boundaries. The initial queue contains
no user or receipt data and is infrastructure verification rather than hosted receipt processing.
Real PostgreSQL tests cover completion, invalid-job failure redaction, graceful idempotent shutdown,
and restart against an existing queue schema.

The hosted web application is a separate Vite/React workspace and does not import local mobile
storage. Development requests use a relative `/api` base path proxied to the loopback API, while
Fastify keeps CORS disabled. The short-lived synthetic bearer token exists only in React memory and
is attached explicitly with browser credentials omitted. Session, receipt-list, and receipt-create
responses cross strict Zod and shared receipt-domain validation before reaching UI state. The API
list operation accepts authenticated owner identity only, excludes tombstones, applies a hard limit
of 100, and orders deterministically in both storage adapters. Development serves CSS with the
inline-style allowance required by Vite injection; production output retains the stricter
self-hosted style policy. Production authentication, a deployment reverse proxy, revocable sessions,
and response-header CSP remain outside this slice.

The current mobile application has no network dependency and no account boundary. It opens Expo
SQLite through an application adapter and passes a small asynchronous SQLite connection port to the
shared database package. The database package owns migrations and repository behavior; its tests
run against Node's real SQLite implementation. Domain validation is reapplied when records cross
the repository boundary.

The receipt repository uses transactions for multi-table writes, parameterized statements,
optimistic record versions, and deletion tombstones. UI code depends on the repository interface,
not Expo SQLite directly.

Milestone 4 category and tag records are framework-independent, UUID-backed, versioned, and
tombstoned. Shared SQLite repositories validate them on every read and write, reject normalized name
collisions, and prevent deletion while an active receipt assignment exists. Migration 6 leaves
existing nullable receipt categories unchanged and creates versioned receipt-tag relationships for
the assignment flow. A dedicated repository replaces the receipt's category and complete tag set in
one transaction, increments the receipt version, tombstones removed tag relationships, and revives
re-added relationships deterministically. Expense details expose this through a local classification
modal that can create and select records without any network path.

Receipt list filters are validated at both the UI parser and repository boundary, then composed from
parameterized SQL predicates. Purchase-date bounds use the stored timestamp's local calendar-date
prefix. Amount ranges require an explicit currency so values from different currencies are never
compared as though they were equivalent. Category filters support uncategorized receipts, and tag
filters require an active assignment to an active tag.

A read-only reporting repository calculates monthly and category aggregates from active receipt
rows in one SQLite transaction. Every result crosses a validation boundary for month, currency,
positive count, safe integer total, and active category identity. The reports screen groups and
formats each currency independently and labels null category IDs as uncategorized.

CSV serialization is framework-independent domain logic over validated receipt records. It exports
active receipts in deterministic order, renders currency decimals from integer minor units, escapes
CSV structure, and neutralizes spreadsheet formula prefixes in user-entered text. A mobile adapter
downloads a Blob directly on web or shares a private temporary cache file on native. Native cache
cleanup runs after both successful and failed share attempts.

Complete export uses a separate framework-independent package. A database adapter reads the active
receipt graph in one SQLite transaction, including classifications, document metadata, evidence,
and processing history. The archive boundary revalidates records and relationships, writes
deterministic JSON, hashes each record file, and optionally verifies original attachment bytes
against stored size and SHA-256 metadata. ZIP paths come from validated UUID and MIME metadata,
never user filenames. Web downloads the plain ZIP directly; native platforms share a validated
private cache file and remove it afterward.

The same export package treats selected ZIPs as untrusted input. It bounds archive and expanded
sizes, filters paths before decompression, strictly parses the current manifest and record schemas,
verifies the complete file graph and checksums, and reapplies domain relationship validation before
returning typed records or attachment bytes. The mobile restore coordinator requires every exported
document to be an original with included bytes. It writes through the immutable attachment port,
then asks a dedicated SQLite repository to verify that every application table is empty and insert
the complete graph in one transaction. Database failure removes files created by the attempt;
byte-identical leftovers can be reused after interrupted cleanup, while conflicts fail closed.
Format version 1 deliberately excludes derivative metadata and bytes because those previews are
regenerable and restoring metadata without bytes would create invalid references.

Encrypted backup composes these existing boundaries rather than defining another data format. The
framework-independent crypto package validates a bounded versioned envelope and portable 256-bit
key representation. The mobile coordinator always creates a complete structured ZIP with every
original, then uses Expo Crypto's platform AES-256-GCM implementation with a generated 12-byte
nonce, a 16-byte tag, and the exact envelope header as additional authenticated data. Android and
iOS store the active key record through Expo SecureStore; web generates a new ephemeral key for
each prepared backup and never persists it in browser storage. The user sees the recovery key before
file delivery.

Restore authenticates and decrypts the envelope before passing plaintext to the same bounded ZIP
parser, relationship validation, immutable attachment writes, and clean-database transaction used
by plain restore. A recovered key is saved to supported native secure storage only after restore
completes. Native temporary `.rbd` files are removed after sharing succeeds or fails. The encrypted
file protects backup contents at rest; live SQLite and attachment files still rely on the
application sandbox and are not application-layer encrypted.

Receipt bytes cross a framework-independent ingestion boundary that validates decoded JPEG, PNG,
or PDF content, applies configurable resource limits, calculates SHA-256, detects duplicate
originals, and coordinates immutable file creation with metadata persistence. Native files use the
private Expo document directory. Web files use the browser origin-private file system. SQLite stores
only immutable document metadata and opaque storage references. Original and derivative records
are distinct and derivatives must reference an original belonging to the same receipt. No receipt
bytes or metadata are transmitted over a network.

After an original JPEG or PNG is committed, an Expo adapter resizes and re-encodes it locally. A
framework-independent preview writer validates the generated bytes and dimensions, hashes them,
and persists a separate derivative. Preview failure is nonfatal and never tombstones or replaces a
successfully imported original. The detail view opens derivative files through revocable platform
display handles.

Receipt deletion first commits the SQLite tombstone, then removes each referenced file and records
`storage_deleted_at`. Pending rows are retried on startup and through the UI. File deletion is
idempotent so an interruption after byte removal but before the metadata update remains recoverable.

Complete local deletion builds on the same mechanism. Migration 7 adds a singleton durable intent
and SQLite triggers that block new receipt or document inserts until the operation finishes. The
delete-all repository atomically records that intent and tombstones active receipts. A
framework-independent coordinator resumes pending document cleanup at startup; only when every
document has `storage_deleted_at` does one SQLite transaction purge all user-data tables and the
intent. The schema migration ledger is retained. Post-intent errors return a bounded pending state,
so the UI never represents partial cross-storage work as complete.

Milestone 3 processing provenance remains framework-independent. Field evidence uses normalized
page coordinates and explicit source, processor, confidence, acceptance, and correction metadata.
Processing history stores lifecycle state and bounded failure codes rather than receipt-bearing
error messages. OCR implementations return `unknown` through a provider port; the OCR package
clones preserved input bytes and schema-validates bounded pages, blocks, text, confidence, and boxes
before returning typed output. The deterministic provider is test infrastructure, not production
OCR.

The production local provider currently targets iOS only. A repository-owned Expo local module
invokes Apple Vision in a development or release build and returns text observations, native
confidence, and normalized source rectangles. The application copies already validated attachment
bytes to a unique private cache file, calls the module, and removes that file in a `finally` path.
Provider output still crosses the common unknown-data boundary. OCR failure is nonfatal to import,
and processing history contains only bounded status codes. The module is optional, so Android, web,
and Expo Go keep the receipt usable and record that OCR is unavailable without loading a remote
fallback.

Validated OCR output is passed to a separate deterministic parser in `packages/extraction`. Parser
context supplies an explicit default currency, locale date order, and timezone offset. Both context
and parser output cross validation boundaries; instruction-like receipt lines are treated only as
untrusted data and are excluded from merchant candidates. Candidate evidence is written in one
SQLite transaction after successful OCR, while parsing and persistence have their own processing
history result. The detail screen keeps unaccepted suggestions separate from saved receipt values,
shows confidence and execution provenance, and maps normalized page rectangles onto a contained
image preview when a user selects a sourced field. Review opens the existing validated expense form
with normalized suggestions prefilled. One SQLite transaction applies the versioned receipt update,
marks each candidate accepted or corrected, inserts authoritative `user_correction` evidence, and
closes pending parser review history. A failure rolls back every part of the review.

## Intended growth

Future work may add receipt-processing worker queues, hosted attachment deletion/reconciliation,
and focused packages for hosted schemas, providers, and synchronization. These are not required for
local mobile use.

See [ADR-0001](architecture/adr/0001-workspace-and-mobile-foundation.md) and
[ADR-0002](architecture/adr/0002-local-sqlite-repository.md), and
[ADR-0003](architecture/adr/0003-local-attachment-storage.md), and
[ADR-0004](architecture/adr/0004-processing-provenance-and-ocr-boundary.md), and
[ADR-0005](architecture/adr/0005-apple-vision-local-ocr.md), and
[ADR-0006](architecture/adr/0006-deterministic-receipt-parser.md), and
[ADR-0007](architecture/adr/0007-local-category-and-tag-storage.md), and
[ADR-0008](architecture/adr/0008-local-csv-export-delivery.md), and
[ADR-0009](architecture/adr/0009-structured-export-archive.md), and
[ADR-0010](architecture/adr/0010-clean-local-archive-restore.md), and
[ADR-0011](architecture/adr/0011-durable-local-data-deletion.md), and
[ADR-0012](architecture/adr/0012-authenticated-encrypted-backup.md), and
[ADR-0013](architecture/adr/0013-self-hosted-api-authorization-boundary.md), and
[ADR-0014](architecture/adr/0014-owner-scoped-postgresql-persistence.md), and
[ADR-0015](architecture/adr/0015-private-hosted-attachment-storage.md), and
[ADR-0016](architecture/adr/0016-postgresql-worker-queue.md), and
[ADR-0017](architecture/adr/0017-same-origin-development-web-client.md) for accepted decisions.
