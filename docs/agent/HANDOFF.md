# Agent Handoff

## Repository state

Milestones 0 through 5 are complete. The Expo application supports account-free local manual expense
storage; image, camera, and PDF ingestion; immutable originals and bounded previews; local iOS OCR;
deterministic extraction and provenance review; categories, tags, filters, reports, CSV, complete
structured export, strict clean-install restore, and durable delete-all.

Authenticated encrypted backup is implemented as a versioned `.rbd` envelope around the complete
structured ZIP. `packages/crypto` validates envelope framing, metadata, limits, key records, and the
portable `RBK1` recovery-key representation. Expo Crypto supplies AES-256-GCM with generated keys and
nonces. Android and iOS persist the active key through Expo SecureStore; web prepares an ephemeral
key only. The recovery key is displayed before file delivery. Restore authenticates before strict
ZIP parsing and retains a recovered native key only after data restore. Delete-all removes the
native key before the transactional database purge and leaves failures durably retryable.

The encrypted claim applies only to exported `.rbd` files. Live SQLite and receipt attachments are
not application-layer encrypted. Losing both native secure-storage state and the separate recovery
key makes a backup unrecoverable. Native key storage and sharing have not been exercised on physical
hardware in this Linux environment.

## Active direction

Milestone 6 is active. `apps/api` is the first authorization-first server slice: Fastify 5, strict
schemas, bounded errors and request rates, generated OpenAPI 3.1.1, fixed-claim signed development
tokens, and explicit owner-scoped receipt create/read operations. Sixteen targeted tests cover
configuration, repository isolation, strict input, cross-user access, and error redaction. The
in-memory adapter is deliberately non-durable and development identity issuance is not production
authentication.

Next, add PostgreSQL migrations and an adapter that preserves the exact repository ownership
contract, including transaction and two-user isolation tests. Then add private S3-compatible object
storage before the worker or web client. Preserve the local mobile application's complete
independence from accounts and servers, use a containerized secret-free development stack, and do
not imply that private sync or remote processing is end-to-end encrypted.

The complete gate currently passes with 189 Vitest tests, 51 React Native/Jest tests, Expo Doctor
20/20, and all builds. Eleven moderate Expo build-tool advisories remain documented; no high or
critical advisory is present. The Expo web development server runs at `http://localhost:8081`.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Confirm the authorization-first API slice is committed.
4. Begin the PostgreSQL migration and owner-scoped adapter slice.
5. Run `npm run verify` before committing a logical slice or marking a milestone complete.
