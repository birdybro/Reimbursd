# Agent Status

- Current milestone: Milestone 6 - Self-hosted backend and web foundation
- Current task: Add a locally runnable worker foundation with bounded jobs and deterministic
  local/mock provider boundaries.
- Last completed task: Added private immutable S3-compatible original storage, owner-linked
  PostgreSQL document metadata, authenticated upload/download routes, cross-user attachment
  isolation, pinned private MinIO development services, and real PostgreSQL/MinIO integration tests.
- Commands executed: Installed and license-reviewed the AWS S3 client and MinIO Testcontainers
  module; ran targeted type, lint, API, repository, storage, and route tests; ran fifty API tests
  against disposable PostgreSQL 16 and pinned MinIO containers; validated Compose interpolation;
  started a temporary MinIO Compose project, confirmed its health and private bucket initializer,
  and removed its containers, network, and volume; confirmed the Expo development server was left
  running; and ran `npm run verify`.
- Test and build status: `npm run verify` passes. Two hundred twenty Vitest tests and fifty-one React
  Native/Jest interaction tests pass. Formatting, linting, strict type checking, license validation,
  the high-severity audit threshold, Expo Doctor 20/20, all workspace builds, and the production Expo
  web export pass. The API package has fifty passing tests, including real PostgreSQL and MinIO
  integration coverage.
- Current assumptions: The API binds to loopback by default. Development may explicitly use process
  memory for receipts, but production requires PostgreSQL. Attachment routes require both
  PostgreSQL and complete S3-compatible configuration. Hosted originals are private, immutable,
  content-inspected, size/hash-validated, and returned only through authenticated owner-scoped API
  proxying. Synthetic development identity remains non-production infrastructure.
- Known defects: Android/web OCR, PDF page previews, and category/tag rename/delete UI are not
  implemented. Restored derivative previews are not regenerated immediately. Deterministic parsing
  will not cover every receipt layout or language. Image ingestion supports JPEG and PNG, not HEIC
  or WebP. Native Android/iOS launch, native sharing/restore/key storage, and Apple Vision execution
  were not exercised in this Linux environment. The API has no hosted attachment deletion or orphan
  reconciliation, hosted backup, production authentication, worker, web client, CORS policy, or
  deployed TLS guidance. The local MinIO stack uses root credentials for API development. Expo SDK
  57 carries eleven moderate build-tool advisories; there are no high or critical advisories, and
  npm's suggested fix is incompatible with the current Expo stack.
- Current blockers: None.
- Next task: Add a locally runnable worker foundation with bounded jobs and deterministic local/mock
  provider boundaries without changing mobile local availability.
