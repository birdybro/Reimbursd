# Security Model

## Implemented controls

- Strict TypeScript and automated formatting, linting, testing, build, license, and audit gates.
- Locked npm dependency graph.
- No production credentials, analytics, external AI, or location access.
- Integer minor-unit money rules in the framework-free domain package.
- Versioned, transactional SQLite migrations exercised against real SQLite.
- Schema constraints, domain validation at repository boundaries, and parameterized SQL.
- Optimistic versions reject stale updates, and deletion retains explicit tombstones.
- Local expense storage has no account, network, analytics, location, or external-processing path.
- Receipt formats are identified from file signatures and decoded content rather than filename
  extensions or picker MIME values.
- Receipt ingestion enforces configurable byte, page, dimension, and pixel-count limits before
  persistence, and malformed or encrypted PDFs fail closed.
- Original receipt files are written once to private platform or origin storage; SQLite retains
  metadata and opaque references rather than file BLOBs.
- SHA-256 is calculated locally for integrity metadata and duplicate detection.
- Generated JPEG and PNG previews are locally resized, content-validated, bounded, and persisted as
  separate derivatives; preview failure does not remove the validated original.
- Receipt tombstones are committed before file removal. Durable deletion markers, idempotent storage
  operations, startup recovery, and visible retry prevent interrupted cleanup from being forgotten.
- OCR provider input is cloned, and provider output crosses an `unknown` boundary with byte, page,
  block, text, confidence, and normalized-coordinate validation before typed use.
- Processing failures persist bounded codes rather than raw errors, filenames, OCR text, merchant
  names, totals, or other receipt contents.
- iOS OCR uses a GPL-licensed local Expo adapter around the operating-system Vision framework.
  Validated bytes are copied to a unique private cache file, the file is removed after success or
  failure, and malformed native output is rejected before typed use.
- Deterministic extraction validates locale context and parser output, bounds candidate text, treats
  instruction-like receipt lines as data rather than commands, and atomically persists only typed
  field evidence. Suggestions remain separate from saved receipt values.
- Receipt review uses optimistic versions and one SQLite transaction for the structured update,
  evidence acceptance/correction markers, authoritative user-correction evidence, and processing
  review status. Any conflict or persistence failure rolls back the complete review.
- Category and tag boundaries validate UUIDs, normalized bounded names, timestamps, and versions.
  Normalized duplicates are rejected, tombstones remain reserved, and assigned records cannot be
  deleted silently.
- Receipt category and tag replacement validates every selected active record and uses one
  optimistic SQLite transaction for the receipt version plus all relationship changes. Missing,
  deleted, duplicate, excessive, or stale assignments fail without partial changes.
- Receipt-list date, currency, amount, category, tag, and merchant filters are validated before use
  and composed only through parameterized SQL. Amount bounds require a currency, preventing
  misleading cross-currency comparisons.
- Local report aggregates run over active SQLite rows and validate safe integer sums, counts,
  currencies, months, and category identities before display. Different currencies remain separate.
- CSV export revalidates receipt records, formats integer minor units without floating-point math,
  quotes CSV metacharacters, and prefixes formula-like merchant and note cells. Native exports use a
  validated filename and delete their private temporary cache file after success or failure.
- Complete export reads active SQLite records in one transaction, rejects incomplete relationship
  graphs and duplicate identifiers, revalidates domain records, and verifies every selected original
  attachment against both byte size and SHA-256 metadata before archive creation. Archive paths are
  derived from validated UUIDs and MIME types rather than user filenames. Native temporary ZIP files
  are removed after successful or failed sharing.
- Structured restore filters untrusted ZIP entries for exact known paths, traversal, duplication,
  compression method, entry count, and bounded expanded size before accepting decompressed content.
  It strictly validates the current manifest and record schemas, domain relationships, file graph,
  byte sizes, and SHA-256 checksums before any local write. Restore never merges into a nonempty
  database or overwrites a conflicting file. Structured inserts are transactional, and files created
  before a failed database commit receive compensating cleanup with byte-identical retry recovery.
- Authenticated backup always includes the complete validated structured ZIP and wraps it with the
  platform AES-256-GCM implementation, a generated 256-bit key, a new generated 12-byte nonce, the
  exact bounded header as additional authenticated data, and a full 16-byte tag. Wrong keys or any
  header, ciphertext, or tag change fail authentication before ZIP parsing or local writes.
- Encrypted envelope framing, strict header schema, sizes, algorithms, key versions, and recovery-key
  syntax are validated in a framework-independent package. Authenticated plaintext still crosses
  every structured-ZIP resource, schema, checksum, relationship, and clean-restore boundary.
- Android and iOS store the active backup key through Expo SecureStore with unlocked-device,
  device-only accessibility on iOS, platform-protected Android storage, and no biometric
  requirement. Web keys are ephemeral and are not persisted in browser storage. Restore saves a
  recovered native key only after data restoration.
- The user must see the portable recovery key before backup delivery. Native temporary backup files
  are removed after successful or failed sharing. Tests cover nonce variation, wrong keys,
  corruption, truncation, configured limits, strict encrypted round trip, file cleanup, key-store
  validation, and key-retention failure.
- Delete-all requires a dedicated destructive confirmation, persists intent before cleanup, blocks
  new receipt and document inserts while pending, and resumes idempotent file removal at startup.
  Final purge is gated on every document's durable storage-deletion marker and removes all user-data
  tables in one transaction while retaining only schema migration history. Mid-purge rollback and
  export-delete-restore behavior are tested. Native backup-key deletion occurs before final database
  purge and remains durably retryable after a secure-store failure.
- The development API enforces a 64 KiB request-body limit, strict schemas that reject unknown
  fields, fixed-issuer and fixed-audience HS256 bearer tokens with UUID subjects and 15-minute
  expiration, and a bounded global rate limit. Signing material is required through uncommitted
  environment configuration.
- Every hosted receipt repository operation requires an authenticated owner UUID. Cross-owner and
  missing reads return the same bounded `404`; tests exercise two isolated identities. Request
  logging and CORS are disabled, and validation, authentication, conflict, rate, not-found, and
  internal errors do not echo tokens or receipt contents.
- PostgreSQL startup migrations run under one transaction and an advisory lock, reject unknown
  future versions, and record schema changes atomically. Hosted receipt and merchant tables use UUID
  identifiers, relational ownership constraints, parameterized queries, constrained `BIGINT` minor
  units, total-consistency checks, and owner-prefixed indexes. Driver `BIGINT` strings must cross a
  safe-integer validation boundary before entering the domain.
- Production API configuration requires PostgreSQL. Development may use explicit non-durable memory
  storage. Integration tests exercise migration rollback, restart persistence, concurrent duplicate
  writes, transaction cleanup, unsafe stored amounts, and two-owner isolation against PostgreSQL 16.
- Hosted attachment routes are registered only when PostgreSQL and all S3-compatible settings are
  present. Uploads use strict bounded base64 JSON, content inspection, processing limits, SHA-256,
  UUID-derived keys, immutable conditional object creation, owner-linked relational metadata, and
  compensating object cleanup when metadata persistence fails.
- Hosted downloads resolve owner/receipt/document metadata before any object read, stream within the
  configured bound, and revalidate size plus SHA-256 before proxying bytes. Responses expose neither
  object keys nor public/presigned URLs. Cross-owner and missing attachment reads share a bounded
  `404`, and tests verify an unauthorized owner does not invoke object storage.
- The local Compose MinIO endpoint is loopback-only, publishes no administration console, requires
  uncommitted credentials, and creates a bucket with anonymous access disabled. Real MinIO tests
  cover private policy/ACL state, write-once conflicts, bounded reads, and byte-identical round trips.
- The optional worker requires PostgreSQL, isolates queue tables in a dedicated schema, limits the
  readiness handler to one local job, and uses durable `pg-boss` delivery with PostgreSQL
  `LISTEN`/`NOTIFY` plus polling fallback. Unknown job data crosses a strict versioned Zod boundary;
  malformed jobs fail with a stable code rather than serialized payload content. Integration tests
  cover completion, invalid-job failure output, idempotent graceful stop, and restart.
- The development web client uses only a relative same-origin API path. Vite proxies that path to an
  explicitly loopback HTTP target, while API CORS remains disabled. The synthetic bearer token is
  held only in React memory, sent with browser credentials omitted, and discarded on refresh or
  sign-out. Absolute and protocol-relative API locations are rejected.
- Hosted receipt lists are authenticated and owner-scoped, exclude tombstones, return at most 100
  deterministic records, and are tested against both memory and PostgreSQL adapters. Browser API
  responses are size-bounded, strictly schema-validated, and rechecked against shared receipt-domain
  invariants before reaching UI state. The web artifact loads no third-party runtime origin and uses
  a restrictive CSP; only the Vite development server adds its required inline-style allowance.
- Public GPLv3 license and explicit current-capability documentation.

## Partially implemented controls

- Dependency security is checked through npm advisories. Expo SDK 57 currently brings eleven moderate
  build-tool advisories through Expo configuration and `xcode`; no high or critical advisory is
  present, and npm's proposed remediation includes an incompatible Expo Sharing downgrade. Automated
  secret scanning and a generated SBOM will be added to CI as tooling is selected.
- Local SQLite and original attachments rely on the mobile application sandbox or the browser's
  origin/profile isolation and are not application-layer encrypted. Platform secure storage and
  encrypted-backup sharing have not yet been exercised on physical Android or iOS devices in this
  Linux development environment. SecureStore availability and persistence remain platform behavior,
  not the only recovery mechanism.
- The API authentication mechanism is for isolated development only. Tokens cannot be revoked, and
  no password, durable session, TLS termination, hosted attachment deletion/reconciliation, hosted
  backup, or production web reverse-proxy policy exists yet. The current web client deliberately
  supports only same-origin development access and its CSP is delivered as HTML metadata rather
  than an operator-controlled response header. The Compose PostgreSQL and MinIO ports are
  loopback-only, but database, object, and API transport security for a deployed topology remains an
  operator responsibility. The local stack uses MinIO root credentials for the API and is not a
  least-privilege production credential model.
- The worker currently proves only synthetic queue readiness. Receipt jobs, per-job consent and
  provenance, dead-letter operations, cancellation, administrator tooling, and job-specific
  retention/retry policies are not implemented.

## Planned controls

- Cross-platform PDF page-preview generation when a compatible bounded renderer is available.
- An Android-compatible offline OCR adapter.
- Production authentication, deployed same-origin routing, explicit CORS and CSRF behavior, secure
  revocable sessions, response security headers, hosted attachment lifecycle/reconciliation,
  PostgreSQL/object backup and restore, and deployed TLS guidance.
- Provider-contract and synchronization-conflict tests.

## Unsupported claims

Reimbursd does not currently provide live local database encryption, end-to-end encryption,
production authentication, hosted synchronization, forensic secure deletion,
Android/web OCR, or remote AI processing. iOS OCR and native backup key storage/sharing have not been exercised on
physical hardware in this Linux environment. Local receipt storage, plain exports, clean-install
restore, and application-level delete-all are not described as encrypted or securely erased. The
implemented encrypted-backup claim applies only to authenticated `.rbd` files. Product surfaces and
documentation must not imply otherwise.
