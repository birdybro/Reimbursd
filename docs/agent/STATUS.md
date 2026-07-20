# Agent Status

- Current milestone: Milestone 6 - Self-hosted backend and web foundation
- Current task: Add private S3-compatible attachment storage with authenticated owner-scoped access
  and cross-user isolation tests.
- Last completed task: Added optional PostgreSQL 16 receipt persistence with transactional versioned
  migrations, production fail-closed configuration, owner-scoped parameterized queries, safe money
  conversion, restart persistence, and a password-required loopback Compose service.
- Commands executed: Queried and installed license-compatible `pg`, PostgreSQL Testcontainers, and
  typings; ran targeted types, lint, build, license, audit, and thirty-one API tests; validated Compose;
  ran a PostgreSQL-backed API create, restart, and retrieve smoke test on ports 3012/55432; removed
  its synthetic container, network, and volume; confirmed the Expo server remains at
  `http://localhost:8081`; and ran `npm run verify` with real PostgreSQL integration tests.
- Test and build status: `npm run verify` passes. Two hundred one Vitest tests and fifty-one React
  Native/Jest interaction, API authorization, PostgreSQL, coordinator, parser, repository,
  migration, crypto, and storage-adapter tests pass. Formatting, linting, strict type checking,
  license validation, the high-severity audit threshold, Expo Doctor 20/20, all workspace builds,
  and the production Expo web export pass.
- Current assumptions: The API binds to loopback by default. Development may explicitly use process
  memory; production requires PostgreSQL. Hosted money is constrained `BIGINT` and validated into
  safe integers, original timestamp offsets are retained, and every receipt operation includes the
  authenticated owner UUID. Synthetic development identity remains non-production infrastructure.
- Known defects: Android/web OCR, PDF page previews, and category/tag rename/delete UI are not
  implemented. Restored derivative previews are not regenerated immediately. Deterministic parsing
  will not cover every receipt layout or language. Image ingestion supports JPEG and PNG, not HEIC
  or WebP. Native Android/iOS launch, native sharing/restore/key storage, and Apple Vision execution
  were not exercised in this Linux environment. The API has no attachment store, hosted database
  backup, production authentication, worker, web client, CORS policy, or deployed TLS guidance. Expo
  SDK 57 carries eleven moderate build-tool advisories; there are no high or critical advisories,
  and npm's suggested fix is incompatible with the current Expo stack.
- Current blockers: None.
- Next task: Define the hosted attachment trust boundary, add local S3-compatible object storage,
  authenticate attachment access, and prove user B cannot access user A's object.
