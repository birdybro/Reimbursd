# Agent Handoff

## Repository state

Milestones 0 through 5 are complete. The Expo application supports account-free local manual expense
storage; image, camera, and PDF ingestion; immutable originals and bounded previews; local iOS OCR;
deterministic extraction and provenance review; categories, tags, filters, reports, CSV, complete
structured export, strict clean-install restore, durable delete-all, and authenticated encrypted
backup.

The encrypted claim applies only to exported `.rbd` files. Live SQLite and receipt attachments are
not application-layer encrypted. Losing both native secure-storage state and the separate recovery
key makes a backup unrecoverable. Native key storage and sharing have not been exercised on physical
hardware in this Linux environment.

## Active direction

Milestone 6 is active. `apps/api` provides Fastify 5, strict schemas, bounded errors and request
rates, generated OpenAPI 3.1.1, fixed-claim signed development tokens, owner-scoped receipt
create/read, PostgreSQL 16 persistence, and authenticated private S3-compatible original upload and
download. The local Compose stack provides password-required loopback PostgreSQL plus pinned private
MinIO with no published console. Development identity issuance and MinIO root credentials are not
production authentication or a least-privilege deployment model.

`apps/worker` is separately runnable and uses `pg-boss` in a `reimbursd_jobs` PostgreSQL schema. It
enables `LISTEN`/`NOTIFY` with polling fallback, registers one locally concurrent readiness handler,
sends a versioned synthetic UUID job, and reports ready only after strict handler validation. Error
boundaries emit stable messages without job payloads or database URLs. Real PostgreSQL tests cover
completion, malformed-job failure output, idempotent graceful stop, and restart. A built-process
smoke test passed against fresh Compose PostgreSQL and all temporary resources were removed.

The worker readiness job contains no user or receipt data and is not presented as receipt
processing. OCR, AI, email, geocoding, billing, cleanup, synchronization jobs, job-specific consent,
provenance, retention, cancellation, and dead-letter administration remain future work. Local mobile
startup and every account-free workflow remain independent of API, worker, PostgreSQL, and MinIO.

The complete gate passes with 224 Vitest tests, 51 React Native/Jest tests, Expo Doctor 20/20, and
all builds. Four Expo SDK 57 packages were aligned to the patch versions required by current Doctor
compatibility data. Eleven moderate Expo build-tool advisories remain documented; no high or
critical advisory is present. The Expo web development server remains at `http://localhost:8081`.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Confirm the PostgreSQL worker foundation is committed.
4. Define the browser credential/CORS/CSRF boundary before implementing the self-hosted web client.
5. Keep the web client separate from the local mobile app and run `npm run verify` before committing.
