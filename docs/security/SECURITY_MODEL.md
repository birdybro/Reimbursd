# Security Model

## Implemented controls

- Strict TypeScript and automated formatting, linting, testing, build, license, and audit gates.
- Locked npm dependency graph.
- No production credentials, analytics, external AI, location access, or hosted data path.
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
- Public GPLv3 license and explicit current-capability documentation.

## Partially implemented controls

- Dependency security is checked through npm advisories. Expo SDK 57 currently brings ten moderate
  build-tool advisories through Expo configuration and `xcode`; no high or critical advisory is
  present, and npm's proposed remediation is an invalid downgrade to Expo SDK 46. Automated secret
  scanning and a generated SBOM will be added to CI as tooling is selected.
- Local SQLite and original attachments rely on the mobile application sandbox or the browser's
  origin/profile isolation. They are not application-layer encrypted, and this milestone has no
  secure key storage or encrypted backup. Android/iOS storage behavior has not yet been exercised
  on physical devices in this Linux development environment.

## Planned controls

- Cross-platform PDF page-preview generation when a compatible bounded renderer is available, and
  complete data deletion.
- An Android-compatible offline OCR adapter.
- Secure platform key storage and authenticated encrypted backups.
- Server authorization, private object storage, rate limiting, strict CORS, and secure sessions.
- Cross-user isolation, backup restoration, provider-contract, and synchronization-conflict tests.

## Unsupported claims

Reimbursd does not currently provide encrypted backups, end-to-end encryption, authentication,
hosted storage, synchronization, complete data deletion, secure deletion guarantees, Android/web
OCR, or remote AI processing. iOS OCR has not been exercised on Apple hardware in this Linux
environment. Local receipt storage is not described as encrypted. Product surfaces and
documentation must not imply otherwise.
