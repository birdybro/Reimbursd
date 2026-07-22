# ADR 0017: Same-Origin Development Web Client

- Status: Accepted
- Date: 2026-07-18

## Context

Milestone 6 requires a web application that can authenticate against the local server and create and
retrieve owner-scoped receipt metadata. The current API intentionally disables CORS and exposes only
a synthetic development token route, not production authentication. Enabling broad browser CORS or
persisting bearer tokens would enlarge the trust boundary before password/session, revocation, CSRF,
TLS, and deployment policies exist.

The web interface is a hosted-service client, not a replacement for the account-free local mobile
application. It must not import mobile storage, imply synchronization, or suggest production account
security. It also must not load analytics, fonts, images, scripts, or other assets from third-party
origins.

## Decision

Add `apps/web` as a strict Vite and React workspace. During development, the Vite server proxies the
same-origin `/api` path to the loopback API and removes the prefix. Production artifacts also call
only a configurable relative same-origin base path; an eventual self-hosted reverse proxy must route
that path to the API. Keep Fastify CORS disabled. Do not support absolute cross-origin API URLs in
this slice.

Use `POST /development/session` only for explicit development access. Hold the short-lived bearer
token in React memory and attach it explicitly to API requests. Never write the token or synthetic
identity to local storage, session storage, cookies, URLs, logs, or error messages. A page refresh or
sign-out discards it. Because authentication is not cookie-based and the browser does not attach the
bearer automatically, this development flow does not introduce a cookie-CSRF mechanism; XSS and
token exfiltration remain reasons to keep a restrictive content security policy and avoid external
code.

Add a bounded authenticated `GET /v1/receipts` route returning at most 100 active owner records. The
web client schema-validates session, error, and receipt responses, uses framework-free integer-money
and date utilities, and supports development sign-in, receipt list/search, and manual creation.
Unknown fields and invalid responses fail closed with bounded user-facing recovery states.

## Consequences

- Browser development works without enabling cross-origin credentials or wildcard CORS.
- A reverse proxy is required to serve production web and API paths from one trusted origin.
- Development tokens disappear on refresh and cannot be revoked before their 15-minute expiration.
- The initial list is deliberately bounded and not yet a paginated reporting/search API.
- Production authentication, secure revocable cookies or equivalent credentials, CSP response
  headers, TLS termination, deployment proxy configuration, and multi-user account UX remain
  incomplete. The web application must continue to label its current access mode as development.
