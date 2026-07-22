# Self-Hosting

Milestone 6 is in progress. The repository contains a locally runnable Fastify API with strict JSON
validation, generated OpenAPI 3.1.1 documentation, rate limiting, short-lived signed bearer tokens
for development, server-side receipt ownership checks, optional PostgreSQL persistence, private
S3-compatible original attachment storage, a durable synthetic-readiness worker, and a separate
same-origin development web client.

The current stack is not a production-ready self-hosted system. It has no production authentication,
token revocation, hosted attachment deletion or reconciliation, deployment reverse proxy, TLS
termination, email delivery, database/object backup workflow, or provider services. Do not expose it
to an untrusted network or represent development identity issuance as account authentication.

## Run the development API

Install dependencies and create `.env` from the committed secret-free template. Set these to
separate generated random values:

- `REIMBURSD_API_JWT_SECRET`: at least 32 characters.
- `REIMBURSD_POSTGRES_PASSWORD`: the local PostgreSQL password.
- `REIMBURSD_MINIO_ROOT_USER`: the local MinIO access key.
- `REIMBURSD_MINIO_ROOT_PASSWORD`: the local MinIO secret key.

For this loopback-only development stack, set `REIMBURSD_OBJECT_ACCESS_KEY_ID` and
`REIMBURSD_OBJECT_SECRET_ACCESS_KEY` to the same values as the two MinIO root variables. Set
`REIMBURSD_DATABASE_URL` to a PostgreSQL URL containing the configured password. Keep `.env`
uncommitted.

```sh
npm install
cp .env.example .env
docker compose up -d postgres minio minio-init
```

Start the API, hosted-web client, and worker in separate terminals:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

```sh
npm run dev:worker
```

Open `http://127.0.0.1:4173`. Vite proxies same-origin `/api` requests to the loopback API and strips
that prefix. `REIMBURSD_WEB_API_PROXY_TARGET` may override the target only with an explicit loopback
HTTP URL. The browser client rejects absolute API base URLs, holds the development token only in
memory, and discards it on refresh or sign-out. Production artifacts still require an operator
reverse proxy that serves web and API paths from one trusted origin; that deployment configuration
is not implemented.

PostgreSQL and the MinIO S3 endpoint bind only to loopback. The MinIO administration console is not
published. The short-lived initializer creates the configured bucket and explicitly removes
anonymous access. Both images are pinned. The development API credentials have full access to this
single local MinIO instance; use a bucket-scoped non-root identity when deploying an S3-compatible
service outside this local stack.

The API applies versioned PostgreSQL migrations before listening and rejects database schema
versions newer than the application supports. Receipt, merchant, and document rows carry owner
identity; metadata reads include owner predicates and foreign keys prevent cross-owner attachment
links. Amounts are constrained `BIGINT` minor units, and receipt timestamp text retains its original
ISO 8601 offset.

Object-storage configuration is all-or-nothing and is rejected without PostgreSQL. Upload accepts
strict base64 JSON for JPEG, PNG, and PDF originals up to 25 MiB decoded. It validates file content
and processing limits, calculates SHA-256, and uses an immutable UUID-derived object key that does
not contain the original filename. A metadata failure triggers object cleanup. Downloads are
proxied only after an owner-scoped metadata lookup and byte-size/SHA-256 revalidation. API responses
never expose the bucket or storage key. Resumable upload, hosted deletion, lifecycle policies, and
orphan reconciliation are not implemented yet.

## Development routes

The API defaults to `127.0.0.1:3000`. Readiness is available at `/health`; the machine-readable
contract is available at `/openapi.json`. With `REIMBURSD_DEV_AUTH_ENABLED=true`,
`POST /development/session` accepts a synthetic UUID `userId` and issues a 15-minute token for local
testing. The route is absent when the setting is false, and production configuration rejects it.

Bearer authentication is required for:

- `POST /v1/receipts`
- `GET /v1/receipts`
- `GET /v1/receipts/{receiptId}`
- `POST /v1/receipts/{receiptId}/documents`
- `GET /v1/receipts/{receiptId}/documents/{documentId}/content`

The authenticated token subject, never a request body field, determines ownership. Cross-owner and
missing receipt/document reads return the same bounded `404`; unauthorized document requests do not
read object storage.

## Development worker

`npm run dev:worker` connects to the same PostgreSQL database and maintains a separate
`reimbursd_jobs` schema through `pg-boss`. Startup registers a single-concurrency system readiness
queue, sends a versioned synthetic UUID job, validates it at the handler boundary, and reports ready
only after handler delivery. PostgreSQL notifications provide low-latency wakeup with bounded polling
as the correctness fallback. `SIGINT` and `SIGTERM` stop job fetching and close queue connections.

This readiness job contains no receipt or user content. No receipt OCR, AI, email, geocoding,
billing, attachment cleanup, or synchronization job is implemented. The worker is not required by
the local mobile application.

Without `REIMBURSD_DATABASE_URL`, development receipt metadata remains process memory and disappears
at restart. Attachment configuration is unavailable in that mode. The local mobile application
continues to run without this API, an account, PostgreSQL, MinIO, or environment configuration.
