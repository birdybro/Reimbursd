# Reimbursd

**Scan it. Verify it. Own your data.**

Reimbursd is a GPLv3, local-first expense and receipt tracking system for mobile and web. The core
product is designed to remain useful without an account, subscription, cloud service, or external
AI provider.

## Current status

Milestone 2 is in progress. The Expo application can create, view, edit, search, filter, and delete
manual expenses, and it can capture JPEG/PNG receipts or import JPEG, PNG, and multi-page PDF
originals into private local storage. Import validates content and limits, records SHA-256 and
provenance, and requires no account or network service. Deleting an expense removes its local
receipt bytes with durable retry after interruption. Generated previews, delete-all, export, and
backup are not complete, and the project does not claim production readiness.

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
