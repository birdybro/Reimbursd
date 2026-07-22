# ADR 0016: PostgreSQL Worker Queue Foundation

- Status: Accepted
- Date: 2026-07-18

## Context

Milestone 6 requires a locally runnable worker without making mobile local mode depend on hosted
infrastructure. The repository already requires PostgreSQL for durable hosted API data. A worker
must eventually execute retryable receipt-processing and provider jobs without ad hoc in-memory
timers, silent loss on restart, unbounded concurrency, or another mandatory queue service.

No hosted receipt-processing contract exists yet. Adding OCR, AI, email, billing, geocoding, or
attachment cleanup jobs before their domain and consent boundaries would present placeholders as
features and risk storing sensitive payloads without a retention design. The first slice still needs
to prove real durable queue startup, delivery, validation, and shutdown rather than merely launching
an idle process.

## Decision

Add `apps/worker` as a strict TypeScript workspace using the MIT-licensed `pg-boss` library and the
existing PostgreSQL 16 service. `pg-boss` provides PostgreSQL `SKIP LOCKED`, `LISTEN`/`NOTIFY`, retry,
retention, concurrency, and schema lifecycle behavior behind a maintained API. This avoids a second
queue datastore and avoids hand-rolling delivery semantics. Raise the repository Node.js minimum to
22.12 because the selected maintained release requires it.

The initial worker owns one namespaced system-readiness queue. On startup it registers a
single-concurrency handler, publishes one versioned synthetic job containing only a generated UUID,
and validates the job at the handler boundary. Successful handling proves the configured process can
write, receive, validate, and complete a durable job. Provider/library errors are reduced to bounded
process messages; job payloads and connection strings are never logged. Graceful shutdown stops job
fetching and closes PostgreSQL resources.

Real PostgreSQL integration tests must exercise startup, delivery, invalid-payload failure, clean
shutdown, and restart without requiring paid or external services. The worker remains an optional
hosted process; local mobile startup, storage, OCR, export, backup, and deletion retain no dependency
on it.

## Consequences

- PostgreSQL is the only infrastructure required for the initial worker and queue.
- The repository and CI require Node.js 22.12 or newer.
- The readiness job is infrastructure verification, not receipt processing or a user-facing feature.
- No receipt content, filename, merchant, amount, OCR text, token, or provider credential belongs in
  the readiness payload.
- Receipt-processing queues, job-specific retries, consent, provenance, retention, cancellation,
  dead-letter operations, and administration remain future slices with separate acceptance criteria.
