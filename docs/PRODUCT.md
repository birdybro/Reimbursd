# Product

## Identity

**Reimbursd**

Scan it. Verify it. Own your data.

## Goal

Reimbursd helps people capture, verify, organize, export, and delete expense and receipt records
while retaining control of their data. Mobile local mode requires no account. Optional hosted
services may add web access, synchronization, storage, and explicitly authorized remote processing.

## Product priorities

1. Data integrity and user safety.
2. Privacy and user ownership.
3. Correctness and maintainability.
4. Local and offline functionality.
5. Transparent provenance.
6. Accessibility and usability.

## Current scope

Milestones 0 through 5 provide the repository foundation, local manual expenses, immutable receipt
ingestion, local OCR boundaries, deterministic extraction and review, classifications, reports,
plain export and clean restore, durable local deletion, and authenticated encrypted backup files.
Milestone 6 is active. Its first development API slice establishes strict network validation,
generated OpenAPI, signed synthetic development identities, and server-side receipt ownership.
Optional PostgreSQL 16 persistence now applies transactional versioned migrations and owner-scoped
queries tested against a real disposable database; development can still use explicitly non-durable
process memory. Optional private S3-compatible original storage uses owner-linked PostgreSQL
metadata, immutable content-validated objects, and authenticated proxy downloads tested against a
real disposable MinIO service. A PostgreSQL-backed worker foundation executes a versioned synthetic
readiness job but no receipt content or provider processing. Hosted attachment deletion, production
authentication, receipt-processing jobs, and the web client are not implemented. Synchronization,
billing, remote AI, and location enrichment remain later milestones.
