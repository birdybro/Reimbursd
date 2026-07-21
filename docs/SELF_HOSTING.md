# Self-Hosting

Milestone 6 is in progress. The repository contains a locally runnable Fastify API with strict JSON
validation, generated OpenAPI 3.1.1 documentation, rate limiting, short-lived signed bearer tokens
for development, server-side receipt ownership checks, optional PostgreSQL persistence, and private
S3-compatible original attachment storage.

The current API is not a production-ready self-hosted system. It has no production authentication,
token revocation, hosted attachment deletion or reconciliation, worker, web client, CORS policy, TLS
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
npm run dev:api
```

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
- `GET /v1/receipts/{receiptId}`
- `POST /v1/receipts/{receiptId}/documents`
- `GET /v1/receipts/{receiptId}/documents/{documentId}/content`

The authenticated token subject, never a request body field, determines ownership. Cross-owner and
missing receipt/document reads return the same bounded `404`; unauthorized document requests do not
read object storage.

Without `REIMBURSD_DATABASE_URL`, development receipt metadata remains process memory and disappears
at restart. Attachment configuration is unavailable in that mode. The local mobile application
continues to run without this API, an account, PostgreSQL, MinIO, or environment configuration.
