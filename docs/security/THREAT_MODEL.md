# Threat Model

## Current assets and boundaries

The local application accepts merchant names, dates, currency values, amounts, notes, untrusted
JPEG, PNG, and PDF receipt files, and untrusted structured-export ZIPs. Structured records, receipt
originals, integrity hashes, filenames, provenance, and file metadata are current assets. The npm
registry is a build-time trust boundary; the Expo runtime, local device sandbox, file and archive
decoders, operating-system picker, and web browser origin/profile are application boundaries.

## Current threats

- Malicious or compromised dependencies entering through installation.
- Accidental inclusion of secrets or personal receipt data in source, fixtures, or logs.
- Incorrect money conversion causing later data-integrity failures.
- Malformed input or search text violating database integrity or altering SQL behavior.
- Concurrent or stale edits silently overwriting a user's corrected values.
- Malformed or oversized images and PDFs exhausting memory or bypassing declared file types.
- Malformed, oversized, highly expanded, path-traversing, or internally inconsistent restore ZIPs
  exhausting resources, writing outside storage boundaries, or corrupting local data.
- Malicious OCR-provider output returning oversized text, invalid coordinates, or unexpected shapes.
- Raw OCR or provider errors leaking receipt contents into logs or durable failure records.
- Interrupted database/file operations orphaning receipt bytes or forgetting required cleanup.
- Local device, browser-profile, or site-data loss removing unbacked-up expenses.
- Another process or user with access to an unlocked device or browser profile reading local data.
- Unsupported privacy or encryption claims creating user risk.

## Current mitigations

- Lockfile-based reproducible installation and automated high-severity advisory checks.
- Dependency license validation and reviewed direct dependencies.
- Synthetic-only fixture policy and no telemetry integration.
- Integer minor-unit domain rules with unit tests.
- Domain validation, schema constraints, parameterized queries, and transaction rollback tests.
- Optimistic versions for updates and tombstones for deletions.
- Signature checks, content decoding, and configurable byte, page, dimension, and pixel-count limits.
- Exact ZIP path allowlisting, pre-extraction entry and expanded-size limits, strict current-schema
  parsing, complete manifest/file/checksum validation, and domain validation before restore writes.
- Clean-database restore, transactional record insertion, immutable attachment writes, conflict
  refusal, compensating cleanup, and byte-identical recovery after interrupted cleanup.
- Immutable original storage, SHA-256 duplicate detection, compensating failed writes, and durable,
  idempotent attachment-deletion retry.
- Defensive OCR input copies, schema-validated and bounded provider output, normalized boxes, and
  redacted processing failure codes.
- Honest UI and documentation that local storage is not an encrypted backup.
- Documentation that distinguishes implemented and planned controls.

## Future review triggers

Revisit this model before adding networking, authentication, cryptography, synchronization,
location, or billing. Receipt images, OCR text, and imported archives must always be treated as
untrusted data and never as executable instructions.
