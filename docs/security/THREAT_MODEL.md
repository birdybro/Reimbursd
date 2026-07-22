# Threat Model

## Current assets and boundaries

The local application accepts merchant names, dates, currency values, amounts, notes, untrusted
JPEG, PNG, and PDF receipt files, and untrusted structured-export ZIPs. Structured records, receipt
originals, integrity hashes, filenames, provenance, file metadata, encrypted `.rbd` files, and
backup recovery keys are current assets. The npm registry is a build-time trust boundary; the Expo
runtime, platform cryptography and secure storage, local device sandbox, file and archive decoders,
operating-system picker/share destination, and web browser origin/profile are application
boundaries. The development API adds untrusted HTTP requests, signed bearer tokens, process-local
receipt metadata, and the local network interface as current boundaries.
PostgreSQL adds database credentials, durable hosted receipt rows, migrations, the node-postgres
driver, a loopback Compose port, and the Docker daemon used by integration tests as boundaries.
Private hosted attachments add untrusted base64 HTTP bodies, original filenames, object keys,
owner-linked document metadata, S3 credentials and responses, a loopback MinIO endpoint, and
cross-datastore write/cleanup behavior as current boundaries.
The worker adds a separately connected process, a `pg-boss` schema, durable job payload and output
rows, queue migrations, notifications, handler concurrency, and shutdown behavior as current
boundaries. The only current job payload is a synthetic schema version and UUID.

## Current threats

- Malicious or compromised dependencies entering through installation.
- Accidental inclusion of secrets or personal receipt data in source, fixtures, or logs.
- Incorrect money conversion causing later data-integrity failures.
- Malformed input or search text violating database integrity or altering SQL behavior.
- Concurrent or stale edits silently overwriting a user's corrected values.
- Malformed or oversized images and PDFs exhausting memory or bypassing declared file types.
- Malformed, oversized, highly expanded, path-traversing, or internally inconsistent restore ZIPs
  exhausting resources, writing outside storage boundaries, or corrupting local data.
- Malformed, oversized, truncated, or modified encrypted envelopes bypassing validation; wrong-key
  output reaching restore; or nonce reuse weakening AES-GCM authentication and confidentiality.
- Device loss, uninstall, browser refresh, platform secure-storage loss, or user loss of the
  recovery key making an encrypted backup unavailable.
- Receipt data leaking through visible envelope metadata, temporary backup files, errors, or logs.
- Malicious OCR-provider output returning oversized text, invalid coordinates, or unexpected shapes.
- Raw OCR or provider errors leaking receipt contents into logs or durable failure records.
- Interrupted database/file operations orphaning receipt bytes or forgetting required cleanup.
- Concurrent mutation during delete-all introducing new data after attachment cleanup or allowing a
  partial purge to be represented as complete.
- Local device, browser-profile, or site-data loss removing unbacked-up expenses.
- Another process or user with access to an unlocked device or browser profile reading local data.
- Missing object authorization exposing another API user's receipt; forged, expired, wrong-issuer,
  or wrong-audience tokens crossing the authenticated boundary; oversized or repeated requests
  exhausting the server; and exceptions reflecting receipt data into responses or logs.
- Missing owner predicates in SQL, partial or concurrent migrations, cross-owner foreign-key
  relationships, database constraint bypass, unsafe `BIGINT` conversion, committed credentials, and
  a database connection string or driver exception leaking through startup or HTTP errors.
- Public bucket configuration, exposed object keys, filename-derived traversal, overwrite races,
  oversized or corrupt object responses, cross-owner attachment lookup, orphaned objects after
  metadata failure, or S3 credentials/provider errors leaking through responses and logs.
- Unvalidated or oversized jobs reaching handlers, queue errors serializing sensitive payloads,
  unbounded concurrency, duplicate process startup, interrupted shutdown, incompatible queue schema
  changes, or worker availability becoming a dependency of local mobile use.
- Unsupported privacy or encryption claims creating user risk.

## Current mitigations

- Lockfile-based reproducible installation and automated high-severity advisory checks.
- Dependency license validation and reviewed direct dependencies.
- Synthetic-only fixture policy and no telemetry integration.
- Integer minor-unit domain rules with unit tests.
- Domain validation, schema constraints, parameterized queries, and transaction rollback tests.
- Optimistic versions for updates and tombstones for deletions.
- Signature checks, content decoding, and configurable byte, page, dimension, and pixel-count limits.
- Exact ZIP path allowlisting, pre-extraction entry and expanded-size limits, strict current-schema
  parsing, complete manifest/file/checksum validation, and domain validation before restore writes.
- Clean-database restore, transactional record insertion, immutable attachment writes, conflict
  refusal, compensating cleanup, and byte-identical recovery after interrupted cleanup.
- AES-256-GCM through Expo's platform primitive with generated 256-bit keys, platform-generated
  12-byte nonces, full 16-byte tags, and exact bounded headers as additional authenticated data.
  Strict framing and metadata validation precede decryption; authentication precedes ZIP parsing;
  strict structured validation still precedes every local write.
- A portable recovery key is displayed before file creation. Supported native platforms retain the
  active key in Expo SecureStore for convenience, while web never persists it. Restore retains a
  recovered native key only after data restore completes, and documentation treats secure storage
  as non-guaranteed rather than the only recovery path.
- Visible envelope metadata excludes receipt contents and filenames. Native temporary `.rbd` files
  are removed after share success or failure, and user-facing errors are bounded. A source audit
  found no application logger or `console` calls in `apps/` or `packages/`.
- Immutable original storage, SHA-256 duplicate detection, compensating failed writes, and durable,
  idempotent attachment-deletion retry.
- Durable delete-all intent, database insert guards, a restart-blocking retry surface, attachment
  cleanup gating, transactional user-table purge, and explicit non-forensic-erasure language.
- Defensive OCR input copies, schema-validated and bounded provider output, normalized boxes, and
  redacted processing failure codes.
- Honest UI and documentation that encrypted backup protects the exported file, while live local
  storage remains unencrypted and loss of both key copies is unrecoverable.
- Strict API request schemas and body limits, fixed signed-token claims and expiration, explicit
  owner parameters on every receipt repository operation, indistinguishable cross-owner and missing
  reads, bounded rate limiting and errors, disabled request logging, and two-identity isolation tests.
- Transactional advisory-locked migrations, future-version refusal, owner-scoped parameterized SQL,
  relational owner constraints, safe-integer parsing, production refusal of memory fallback,
  loopback-only initial Compose exposure, ignored secret-bearing `.env`, and real PostgreSQL rollback
  and two-user integration tests.
- All-or-nothing S3 configuration tied to PostgreSQL; private loopback MinIO with no published
  console or anonymous policy; content-derived MIME metadata; UUID-only keys; bounded streaming;
  immutable conditional writes; size/hash validation; metadata-first authorization on reads;
  compensating cleanup; bounded errors; and real MinIO plus cross-owner tests.
- A maintained PostgreSQL queue engine in its own schema, strict versioned unknown-data validation,
  single local handler concurrency, a data-free synthetic readiness contract, stable failure and
  process messages, graceful idempotent stop, no mobile dependency, and real PostgreSQL delivery and
  restart tests.
- Documentation that distinguishes implemented and planned controls.

## Future review triggers

Revisit this model before changing algorithms, rotating keys, adding password-derived keys,
production authentication, hosted attachment deletion/direct transfer, a web origin,
synchronization, receipt-bearing worker jobs, location, billing, or a deployed database/object
topology. Receipt images, OCR text, imported archives, HTTP bodies, database rows, queued jobs,
object responses, and provider responses must always be treated as untrusted data and never as
executable instructions.
