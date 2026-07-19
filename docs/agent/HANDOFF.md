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

Milestone 6 is active. Preserve the local mobile application's complete independence from accounts
and servers. Start with authorization and cross-user isolation boundaries, a small PostgreSQL-backed
receipt-metadata API, private object storage, machine-readable API contracts, and deterministic local
providers. Use a containerized secret-free development stack and do not imply that private sync or
remote processing is end-to-end encrypted.

The complete gate currently passes with 170 Vitest tests, 51 React Native/Jest tests, Expo Doctor
20/20, and all builds. Eleven moderate Expo build-tool advisories remain documented; no high or
critical advisory is present. The Expo web development server runs at `http://localhost:8081`.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Commit the complete Milestone 5 slice if it has not yet been committed.
4. Begin the highest-priority unblocked Milestone 6 task.
5. Run `npm run verify` before committing a logical slice or marking a milestone complete.
