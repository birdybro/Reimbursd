# Agent Status

- Current milestone: Milestone 6 - Self-hosted backend and web foundation
- Current task: Add PostgreSQL migrations and an owner-scoped adapter without changing the tested
  API authorization contract or coupling local mobile use to a server.
- Last completed task: Added the first locally runnable Milestone 6 API slice with strict bounded
  schemas, generated OpenAPI 3.1.1, rate limiting, opt-in signed development identities, explicit
  owner-scoped receipt storage, cross-user isolation, and redacted errors.
- Commands executed: Installed and license-checked Fastify, official JWT, rate-limit, and Swagger
  plugins plus `tsx`; ran targeted API tests, lint, types, and build; started the API through
  `npm run dev:api` on `127.0.0.1:3011`; verified `/health` and `/openapi.json`; stopped the temporary
  API; confirmed the Expo server remains at `http://localhost:8081`; and ran `npm run verify`.
- Test and build status: `npm run verify` passes. One hundred eighty-nine Vitest tests and fifty-one
  React Native/Jest interaction, API authorization, coordinator, parser, repository, migration,
  crypto, and storage-adapter tests pass. Formatting, linting, strict type checking, license
  validation, the high-severity audit threshold, Expo Doctor 20/20, all workspace builds, and the
  production Expo web export pass.
- Current assumptions: The API binds to loopback by default. Its fixed-claim 15-minute HS256 tokens
  and synthetic identity route are development infrastructure, not production authentication. Every
  repository operation receives the authenticated owner UUID, and process restart intentionally
  removes in-memory API receipts. Local mobile storage and workflows remain independent of the API.
- Known defects: Android/web OCR, PDF page previews, and category/tag rename/delete UI are not
  implemented. Restored derivative previews are not regenerated immediately. Deterministic parsing
  will not cover every receipt layout or language. Image ingestion supports JPEG and PNG, not HEIC
  or WebP. Native Android/iOS launch, native sharing/restore/key storage, and Apple Vision execution
  were not exercised in this Linux environment. The API has no durable database, attachment store,
  production authentication, worker, web client, CORS policy, or TLS termination. Expo SDK 57
  carries eleven moderate build-tool advisories; there are no high or critical advisories, and npm's
  suggested fix is incompatible with the current Expo stack.
- Current blockers: None.
- Next task: Add versioned PostgreSQL receipt migrations, an owner-scoped repository adapter, and
  migration, rollback, conflict, and two-user isolation integration tests.
