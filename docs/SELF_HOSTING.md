# Self-Hosting

Milestone 6 is in progress. The repository contains a locally runnable Fastify API with strict JSON
validation, generated OpenAPI 3.1.1 documentation, rate limiting, short-lived signed bearer tokens
for development, server-side receipt ownership checks, and optional PostgreSQL receipt persistence.
Without a configured database URL, it stores receipt metadata only in process memory and restart
removes every API record.

The current API is not a deployable self-hosted system. It has no attachment storage, production
authentication, token revocation, worker, web client, CORS policy, TLS termination, email delivery,
or provider services. Do not expose it to an untrusted network or represent development identity
issuance as account authentication.

## Run the development API

Install dependencies, copy the secret-free environment template, and set
`REIMBURSD_API_JWT_SECRET` and `REIMBURSD_POSTGRES_PASSWORD` in `.env` to separate generated random
values. Set `REIMBURSD_DATABASE_URL` to a PostgreSQL URL containing the configured database name,
user, password, host, and port. The `.env` file is ignored by Git; never commit the populated URL.

```sh
npm install
cp .env.example .env
docker compose up -d postgres
npm run dev:api
```

The Compose service binds PostgreSQL only to loopback and requires a nonempty password. The API
applies versioned migrations before listening and rejects database schema versions newer than the
application supports. PostgreSQL receipt and merchant rows include owner identity, and every read
uses an owner predicate. Amounts are constrained `BIGINT` minor units; the adapter rejects values
outside JavaScript's safe-integer range. Receipt timestamps retain their original ISO 8601 offset.

The API defaults to `127.0.0.1:3000`. Readiness is available at `/health`; the machine-readable
contract is available at `/openapi.json`. With `REIMBURSD_DEV_AUTH_ENABLED=true`,
`POST /development/session` accepts a synthetic UUID `userId` and issues a 15-minute token for local
testing. The route is not registered when the setting is false, and configuration rejects it when
`NODE_ENV=production`.

Each `POST /v1/receipts` and `GET /v1/receipts/{receiptId}` request requires the signed bearer token.
The authenticated UUID, never a body field, determines ownership. Cross-owner and missing receipt
reads return the same bounded `404` response.

The mobile application continues to run locally without this API, an account, PostgreSQL, or any
environment configuration. The planned private S3-compatible attachment storage, worker, web
client, local email capture, and mock providers will not depend on the official hosted service or
paid accounts.
