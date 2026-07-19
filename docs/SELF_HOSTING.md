# Self-Hosting

Milestone 6 is in progress. The repository currently contains a locally runnable Fastify API with
strict JSON validation, generated OpenAPI 3.1.1 documentation, rate limiting, short-lived signed
bearer tokens for development, and server-side receipt ownership checks. It stores receipt metadata
only in process memory. Restarting the API removes every API record.

The current API is an authorization-first development slice, not a deployable self-hosted system.
It has no PostgreSQL persistence, attachment storage, production authentication, token revocation,
worker, web client, CORS policy, TLS termination, email delivery, or provider services. Do not expose
it to an untrusted network or represent development identity issuance as account authentication.

## Run the development API

Install dependencies, copy the secret-free environment template, and set
`REIMBURSD_API_JWT_SECRET` in `.env` to a generated random value containing at least 32 characters.
The `.env` file is ignored by Git.

```sh
npm install
cp .env.example .env
npm run dev:api
```

The default service binds only to `127.0.0.1:3000`. Readiness is available at `/health`; the
machine-readable contract is available at `/openapi.json`. With
`REIMBURSD_DEV_AUTH_ENABLED=true`, `POST /development/session` accepts a synthetic UUID `userId` and
issues a 15-minute token for local testing. The route is not registered when the setting is false,
and configuration rejects it when `NODE_ENV=production`.

Each `POST /v1/receipts` and `GET /v1/receipts/{receiptId}` request requires the signed bearer token.
The authenticated UUID, never a body field, determines ownership. Cross-owner and missing receipt
reads return the same bounded `404` response.

The mobile application continues to run locally without this API, an account, or any environment
configuration. The planned PostgreSQL, private S3-compatible attachment storage, worker, web client,
local email capture, and mock providers will not depend on the official hosted service or paid
accounts.
