# ADR 0013: Self-Hosted API Authorization Boundary

- Status: Accepted
- Date: 2026-07-18

## Context

Milestone 6 introduces the first server process. It must not become a dependency of account-free
mobile use, and it must establish server-side object authorization before PostgreSQL, object
storage, synchronization, or a web client increase the exposed surface. The repository has no
existing HTTP or authentication framework. The current runtime baseline is Node.js 22.

The first slice needs a locally runnable service, schema validation at the HTTP boundary,
machine-readable API documentation, deterministic tests, bounded errors, and proof that one user
cannot read another user's receipt. A development identity mechanism is needed before production
authentication is selected, but it must not be confused with production account security.

## Decision

Add `apps/api` as an independent TypeScript workspace using Fastify 5. Fastify 5 supports the
repository's Node.js runtime and supplies bounded body parsing, route schemas, an injection test
surface, and a maintained plugin ecosystem. Use the official `@fastify/jwt`,
`@fastify/rate-limit`, and `@fastify/swagger` plugins for signed bearer-token verification,
request throttling, and an OpenAPI contract. These dependencies are MIT licensed.

Represent the authenticated principal only by a validated UUID `sub` claim plus fixed issuer and
audience claims. Require authentication in an `onRequest` hook before protected handlers. Every
repository method receives `ownerId` explicitly; adapters must include it in every object query and
mutation. A cross-owner read returns the same `404` response as a missing object. Do not rely on a
client feature flag, request body owner field, or post-query filtering for authorization.

Provide a development session route only when `REIMBURSD_DEV_AUTH_ENABLED=true`. It signs a
short-lived token for a supplied synthetic UUID and is rejected by production configuration. The
route is for local development and tests, not a password, account, or production authentication
implementation. JWT signing material is required through configuration, validated for minimum
length, and never committed. Tokens include expiration, fixed issuer, and fixed audience claims.

Define the receipt repository as an API-owned port and begin with a deterministic in-memory adapter
for tests and process-local development. This adapter is not represented as durable. Add a
PostgreSQL adapter and migrations in the next slice without changing HTTP ownership semantics.
Generate the OpenAPI document from the same strict route schemas used for runtime validation.

Keep Fastify request logging disabled in this slice so receipt IDs or request bodies are not
accidentally introduced into logs. Return bounded error codes and messages without raw exception,
token, merchant, amount, or note content. Set a conservative request-body limit and global rate
limit. Do not enable CORS until the web origin and credential design are explicit.

## Consequences

- Local mobile startup, storage, export, and backup retain no dependency on `apps/api`.
- Cross-user isolation is testable before a database or object store exists and remains a required
  adapter contract.
- Development authentication is useful but intentionally not production-ready; self-hosted
  deployment documentation must keep it disabled outside isolated local development.
- Process restart loses in-memory API records until the PostgreSQL slice lands.
- JWT revocation, session persistence, password or federated login, CSRF behavior, and web CORS
  policy remain explicit later decisions.
- OpenAPI describes only implemented endpoints and can grow without handwritten contract drift.
