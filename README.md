# Reimbursd

**Scan it. Verify it. Own your data.**

Reimbursd is a GPLv3, local-first expense and receipt tracking system for mobile and web. The core
product is designed to remain useful without an account, subscription, cloud service, or external
AI provider.

## Current status

The project is in Milestone 0. The repository contains the Expo mobile foundation and independent
TypeScript domain utilities. Receipt persistence and the complete manual-expense workflow are the
next milestone; the project does not yet claim production readiness.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- An Expo-supported Android, iOS, or web development environment

## Start locally

```sh
npm install
npm run dev:mobile
```

Use the Expo terminal interface to open an Android emulator, iOS simulator, or browser. No account,
environment variable, hosted service, or paid provider is required.

## Quality gate

```sh
npm run verify
```

This checks formatting, linting, strict TypeScript, tests, dependency licenses, known high-severity
dependency vulnerabilities, and production builds.

See [development documentation](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), and
[privacy commitments](PRIVACY.md) for current details.

## License

Copyright (C) 2026 Reimbursd contributors. Reimbursd is free software licensed under
[`GPL-3.0-only`](LICENSE).
