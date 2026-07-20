# ADR 0014: Owner-Scoped PostgreSQL Persistence

- Status: Accepted
- Date: 2026-07-18

## Context

The first hosted API slice proves authentication and object ownership with process-memory storage.
Milestone 6 next requires durable relational storage and migration tests without changing that HTTP
contract or adding any server dependency to local mobile use. PostgreSQL behavior, including UUID,
`BIGINT`, constraint, transaction, and conflict semantics, must be tested against PostgreSQL rather
than approximated with SQLite or a mock.

Receipt money must remain integer minor units. Node PostgreSQL drivers return `BIGINT` values as
strings by default to avoid silent precision loss. Purchase and capture timestamps must retain their
original timezone offset rather than being normalized irreversibly by a timestamp-with-time-zone
column. Database exceptions and connection strings may contain credentials or receipt data and must
not cross the API error boundary.

## Decision

Use PostgreSQL 16 as the initial hosted relational baseline and the MIT-licensed `pg` driver. Keep
ordered, immutable hosted migrations as GPL-licensed TypeScript data so source and built server use
the same migration set without copying runtime SQL files. The migration runner acquires a
transaction-scoped PostgreSQL advisory lock, rejects unknown future schema versions, applies and
records each pending migration in one transaction, and rolls back schema plus migration metadata on
failure.

Use native UUID columns for owners and identifiers. Keep receipt and merchant identifiers globally
unique while including `owner_id` in every repository query, mutation, index, and relevant foreign
key. Store money in constrained `BIGINT` columns and validate conversion back to JavaScript safe
integers. Store receipt timestamps as bounded ISO 8601 text so the original offset survives; domain
validation remains authoritative at both write and read boundaries.

The API continues to use process memory only when no database URL is configured in development or
tests. Production configuration requires `REIMBURSD_DATABASE_URL` and cannot use this fallback. The
connection string is never logged or returned. API shutdown closes its pool.

Exercise migrations, idempotence, rollback, duplicate conflicts, restart persistence, and two-user
isolation against a disposable `postgres:16-alpine` container through the MIT-licensed Testcontainers
PostgreSQL module. The complete quality gate therefore requires a functioning Docker daemon during
Milestone 6 development and CI. Container credentials and receipt fixtures are synthetic and exist
only for the disposable test process.

## Consequences

- Local mobile remains account-free and has no PostgreSQL or API dependency.
- Hosted receipt metadata survives API process restart when a database URL is configured.
- Every future PostgreSQL adapter must preserve owner predicates as part of its query contract.
- Runtime reads fail closed if database values cannot be represented by the domain model.
- PostgreSQL integration tests are slower and require Docker, but they cover the actual database
  dialect and driver boundary.
- Password or federated authentication, revocation, private attachments, backups, worker processing,
  and web access remain later Milestone 6 slices.
