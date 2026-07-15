# Reimbursd

**Scan it. Verify it. Own your data.**

Reimbursd is a GPLv3, local-first expense and receipt tracking system for mobile and web. The core
product is designed to remain useful without an account, subscription, cloud service, or external
AI provider.

## Current status

Milestone 1 provides the first local manual-expense workflow. The Expo application can create,
view, edit, search, filter, and delete expenses in a versioned local SQLite database without an
account or network service. The project does not yet import receipt files, export data, or claim
production readiness.

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
expenses persist in the platform's local application storage. No account, environment variable,
hosted service, or paid provider is required.

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
