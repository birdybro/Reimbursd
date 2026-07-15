# ADR-0002: Local SQLite repository

- Status: Accepted
- Date: 2026-07-15

## Context

The first product slice must persist manual expenses across application restarts without an account
or external service. The same receipt rules and migration behavior need deterministic integration
tests outside a simulator, while Expo owns the platform database API.

## Decision

Use Expo SQLite as the application storage adapter and keep migrations and receipt persistence in
`packages/database` behind a small asynchronous SQLite connection port. Test that package against
Node's real SQLite implementation. Store money only as integer minor units, preserve timezone-aware
purchase and capture timestamps, use UUID identifiers, reject stale writes with optimistic versions,
and represent deletion with tombstones.

The application initializes the repository once, runs migrations before rendering data, and injects
the repository interface into screens. No UI component imports a database driver.

## Consequences

Mobile records remain in the application sandbox, and web records remain in origin-private browser
storage. Schema and repository behavior can be tested without native UI infrastructure. Expo SQLite
web requires a WASM worker and cross-origin isolation headers in development. Local SQLite is not an
encrypted backup; encryption and backup restoration remain separate milestones.
