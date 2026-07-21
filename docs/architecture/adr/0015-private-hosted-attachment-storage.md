# ADR 0015: Private Hosted Attachment Storage

- Status: Accepted
- Date: 2026-07-18

## Context

Hosted receipt metadata now has an authenticated owner boundary and durable PostgreSQL persistence.
Receipt originals require private object storage without making an object key, bucket URL, or client
feature flag an authorization mechanism. File contents, filenames, and storage-provider errors are
untrusted and potentially sensitive. Object writes and relational metadata cannot share one atomic
transaction, so failure compensation must be explicit and tested.

The repository already has bounded JPEG, PNG, and PDF inspection plus immutable local storage
coordination. The hosted path should reuse those domain rules while keeping S3 SDK concerns inside a
server adapter. Development and self-hosting need an open local service, and tests must prove that a
second authenticated owner cannot retrieve either metadata or bytes.

## Decision

Use the Apache-2.0 `@aws-sdk/client-s3` package behind an API-owned object-storage port. Use a pinned
MinIO release for development and real S3-contract integration tests. Buckets remain private and no
anonymous policy is installed. The initial API proxies authenticated downloads after an owner-scoped
PostgreSQL metadata query; it does not return public or presigned object URLs.

Extend the hosted schema with owner-linked original document metadata. Object keys contain only
validated owner, receipt, and document UUIDs plus an extension derived from inspected content. Never
use the original filename in a key. Store the original filename only as validated metadata. Enforce
immutable conditional object creation, byte and file-processing limits, content inspection, SHA-256,
page and dimension limits, relational ownership, and duplicate hashes before presenting upload as
complete.

The first HTTP upload contract uses strict bounded base64 JSON so the same route schema can generate
accurate OpenAPI and the implementation can validate the complete original before storage. This is
memory-bounded and intentionally not the future resumable large-object protocol. The route accepts
at most the existing 25 MiB original-file limit and applies a corresponding bounded encoded-body
limit.

Write the private object first, then insert metadata. If metadata fails, delete the new object; if
both operations fail, return a bounded internal error and retain the combined failure only in
process. Reads revalidate metadata, downloaded byte length, and SHA-256 before replying. Cross-owner
and absent documents return the same `404` and never call object storage for an unauthorized owner.

Configure the S3 endpoint, region, bucket, path-style mode, access key, and secret key only through
an all-or-nothing environment boundary. Never log this configuration. The Compose stack requires
uncommitted MinIO root credentials, binds its API to loopback, creates one private bucket through a
short-lived client container, and exposes no console port.

## Consequences

- Local mobile attachment storage and every account-free workflow remain unchanged.
- Hosted originals are immutable private objects and relational metadata remains owner-scoped.
- Base64 upload is simple and accurately documented but adds transport and memory overhead; resumable
  streaming upload remains future work.
- Database/object compensation is not a distributed transaction, so cleanup failure remains an
  operational condition requiring later reconciliation tooling.
- Object-store integration tests require Docker and pinned MinIO plus PostgreSQL images.
- Derivatives, deletion, retention, signed direct transfer, synchronization, and remote processing
  remain later slices.
