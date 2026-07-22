# Agent Status

- Current milestone: Milestone 6 - Self-hosted backend and web foundation
- Current task: Add a web client that authenticates against the local API without changing mobile
  local availability.
- Last completed task: Added a separately runnable strict TypeScript worker using a namespaced
  PostgreSQL `pg-boss` queue, versioned synthetic readiness jobs, strict unknown-data validation,
  bounded concurrency/errors, graceful shutdown, restart coverage, and local launch documentation.
- Commands executed: Reviewed current `pg-boss` and Graphile Worker package metadata; selected and
  installed the MIT-licensed `pg-boss` dependency; ran worker unit, type, lint, build, license, and
  real PostgreSQL integration tests; started the built worker against a temporary Compose PostgreSQL
  service, observed durable readiness, stopped it with `SIGINT`, and removed its container, network,
  and volume. The first full gate attempt passed 224 Vitest and 51 UI tests but Expo Doctor changed
  its compatibility data and required four newer SDK 57 patches. Installed the four MIT-licensed
  Doctor-prescribed patch versions, confirmed Doctor 20/20, and reran `npm run verify` successfully.
- Test and build status: `npm run verify` passes. Two hundred twenty-four Vitest tests and fifty-one
  React Native/Jest interaction tests pass. Formatting, linting, strict type checking, license
  validation, the high-severity audit threshold, Expo Doctor 20/20, all workspace builds, and the
  production Expo web export pass. The worker package has four passing tests, including real
  PostgreSQL delivery, invalid-job failure redaction, shutdown, and restart coverage.
- Current assumptions: The API and worker bind/connect only through operator configuration; local
  mobile functionality remains independent. The worker requires PostgreSQL, uses a separate queue
  schema, and currently handles only a versioned synthetic UUID readiness job with no user or receipt
  content. Synthetic development identity and the local MinIO root credential model remain
  non-production infrastructure.
- Known defects: Android/web OCR, PDF page previews, and category/tag rename/delete UI are not
  implemented. Restored derivative previews are not regenerated immediately. Deterministic parsing
  will not cover every receipt layout or language. Image ingestion supports JPEG and PNG, not HEIC
  or WebP. Native Android/iOS launch, native sharing/restore/key storage, and Apple Vision execution
  were not exercised in this Linux environment. The hosted system has no receipt-processing worker
  jobs, hosted attachment deletion or orphan reconciliation, hosted backup, production
  authentication, web client, CORS policy, or deployed TLS guidance. Expo SDK 57 carries eleven
  moderate build-tool advisories; there are no high or critical advisories, and npm's suggested fix
  is incompatible with the current Expo stack.
- Current blockers: None.
- Next task: Establish the web/API browser trust boundary, then implement local development sign-in
  and owner-scoped receipt create/read through the generated API contract.
