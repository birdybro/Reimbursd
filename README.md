# Reimbursd

**Scan it. Verify it. Own your data.**

Reimbursd is a GPLv3, local-first expense and receipt tracking system for mobile and web. The core
product is designed to remain useful without an account, subscription, cloud service, or external
AI provider.

## Current status

Milestones 0 through 5 are complete. The Expo application can create, view, edit, search, filter, and
delete manual expenses, and it can capture JPEG/PNG receipts or import JPEG, PNG, and multi-page PDF
originals into private local storage. Import validates content and limits, records SHA-256 and
provenance, and requires no account or network service. Deleting an expense removes its local
receipt bytes with durable retry after interruption. JPEG and PNG imports receive separate bounded
local previews. Current-schema complete ZIP exports can be restored into a clean local installation.
An explicitly confirmed delete-all action removes all local structured records and receipt files
with durable retry after interruption. Authenticated encrypted backup creation and clean-install
restore are available without an account. Cross-platform OCR and PDF page previews are not
complete, and the project does not claim production readiness.

Milestone 3 includes durable field evidence and processing history, a validated OCR
provider contract, a deterministic test provider, and on-device Apple Vision OCR in iOS development
or release builds. Validated OCR text is parsed locally into merchant, purchase date, currency, and
amount suggestions. The review surface keeps suggestions separate from saved values, shows
confidence and provenance, can highlight source rectangles on image previews, and prefills a
review form. Accepted suggestions, user corrections, receipt updates, and parser review status are
committed atomically. Reviewed evidence remains authoritative over later automation. OCR is
unavailable on Android, web, and Expo Go until a compatible local engine is implemented. Receipt
text is not sent to a Reimbursd or third-party service.

Milestone 4 adds validated, versioned, tombstoned
categories and tags while keeping existing receipts valid. Expense details can create and assign one
category plus multiple tags through an atomic local workflow. The list filters locally by merchant,
purchase date, currency-specific amount range, category, and tag. Local reports show monthly and
category totals without combining currencies. Active expenses can be exported to a local CSV file
through a browser download or native share sheet. A versioned plain ZIP export contains the active
structured dataset, per-file SHA-256 checksums, and optional byte-identical receipt originals.
The application strictly validates a complete ZIP and can restore it without an account into an
empty local database. Delete-all is local, account-free, restart-recoverable, and covered by an
export-delete-restore round trip.

Milestone 5 adds a versioned `.rbd` backup that wraps a complete archive using AES-256-GCM. The
application displays a portable recovery key before creating the file. Android and iOS retain the
active key in platform secure storage for convenience; web keeps it only in memory. Encrypted
restore still applies the complete structured-archive validation boundary and requires an empty
local database. This protects the exported backup file, not the live SQLite database or receipt
store. Losing both platform key storage and the separate recovery key makes the backup
unrecoverable.

Milestone 6 is active. A first locally runnable Fastify API slice now provides strict request
validation, rate limiting, generated OpenAPI, short-lived synthetic development tokens, and tested
server-side owner isolation for manual receipt metadata. Its storage is process memory only; it has
no production authentication, PostgreSQL, private attachment storage, worker, or web client. The
local mobile application does not depend on this service.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- An Expo-supported Android, iOS, or web development environment

## Start locally

```sh
npm install
npm run dev:mobile
```

Use the Expo terminal interface to open an Android emulator, iOS simulator, or browser. Manual
expenses and supported receipt originals persist in the platform's local application storage. No
account, environment variable, hosted service, or paid provider is required.

## Quality gate

```sh
npm run verify
```

This checks formatting, linting, strict TypeScript, domain and SQLite tests, React Native UI
interactions, dependency licenses, known high-severity dependency vulnerabilities, Expo
configuration, and production builds.

See [development documentation](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), and
[privacy commitments](PRIVACY.md) for current details.

## License

Copyright (C) 2026 Reimbursd contributors. Reimbursd is free software licensed under
[`GPL-3.0-only`](LICENSE).
