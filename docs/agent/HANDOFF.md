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
rates, generated OpenAPI 3.1.1, fixed-claim signed development tokens, and explicit owner-scoped
receipt create/read operations. Optional PostgreSQL 16 persistence uses ordered transactional
migrations under an advisory lock, constrained `BIGINT` minor units, original-offset timestamp text,
and owner predicates in every repository operation. Development can still use an explicitly
non-durable memory adapter; production configuration refuses that fallback. Development identity
issuance is not production authentication.

Private hosted original storage is implemented behind an S3-compatible port. Upload validates a
strict bounded base64 request, content-inspects JPEG/PNG/PDF bytes, hashes them, creates an immutable
UUID-derived object, and persists owner/receipt-linked PostgreSQL metadata. Metadata failure triggers
object cleanup. Download authorizes against metadata before object access, streams within the file
limit, and verifies size plus SHA-256 before proxying bytes. API responses expose no storage keys or
public/presigned URLs; cross-owner and missing objects share a bounded `404`.

The development Compose stack includes password-required loopback PostgreSQL and a pinned,
credential-required loopback MinIO endpoint with no published console. A short-lived pinned MinIO
client creates the configured bucket and disables anonymous access. A smoke test confirmed the
service health and private bucket, then removed all temporary resources. Real-container tests cover
PostgreSQL migration/ownership behavior and MinIO policy, immutable writes, bounded reads, and round
trips. Hosted deletion/reconciliation, backups, production credentials/authentication, TLS, the
worker, and the web client remain incomplete.

The complete gate passes with 220 Vitest tests, 51 React Native/Jest tests, Expo Doctor 20/20, and
all builds. Eleven moderate Expo build-tool advisories remain documented; no high or critical
advisory is present. The Expo web development server runs at `http://localhost:8081`.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Confirm the private hosted attachment slice is committed.
4. Add a locally runnable worker and deterministic local/mock provider boundary before the web
   client.
5. Run `npm run verify` before committing a logical slice or marking a milestone complete.
