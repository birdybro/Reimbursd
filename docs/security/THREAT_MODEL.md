# Threat Model

## Current assets and boundaries

Milestone 1 accepts merchant names, dates, currency values, amounts, and notes and persists them in
local SQLite. The database and manual expense records are current assets. The npm registry is a
build-time trust boundary; the Expo runtime, local device sandbox, and web browser origin/profile
are application boundaries.

## Current threats

- Malicious or compromised dependencies entering through installation.
- Accidental inclusion of secrets or personal receipt data in source, fixtures, or logs.
- Incorrect money conversion causing later data-integrity failures.
- Malformed input or search text violating database integrity or altering SQL behavior.
- Concurrent or stale edits silently overwriting a user's corrected values.
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
- Honest UI and documentation that local storage is not an encrypted backup.
- Documentation that distinguishes implemented and planned controls.

## Future review triggers

Revisit this model before adding file import, OCR, networking, authentication, attachments,
cryptography, synchronization, location, or billing. Receipt images and OCR text must always be
treated as untrusted data and never as executable instructions.
