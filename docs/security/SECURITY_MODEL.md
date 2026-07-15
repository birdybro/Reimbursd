# Security Model

## Implemented controls

- Strict TypeScript and automated formatting, linting, testing, build, license, and audit gates.
- Locked npm dependency graph.
- No production credentials, analytics, external AI, location access, or hosted data path.
- Integer minor-unit money rules in the framework-free domain package.
- Versioned, transactional SQLite migrations exercised against real SQLite.
- Schema constraints, domain validation at repository boundaries, and parameterized SQL.
- Optimistic versions reject stale updates, and deletion retains explicit tombstones.
- Local expense storage has no account, network, analytics, location, or external-processing path.
- Public GPLv3 license and explicit current-capability documentation.

## Partially implemented controls

- Dependency security is checked through npm advisories. Expo SDK 57 currently brings ten moderate
  build-tool advisories through Expo configuration and `xcode`; no high or critical advisory is
  present, and npm's proposed remediation is an invalid downgrade to Expo SDK 46. Automated secret
  scanning and a generated SBOM will be added to CI as tooling is selected.
- Local SQLite relies on the mobile application sandbox or the browser's origin/profile isolation.
  It is not application-layer encrypted, and this milestone has no secure key storage or encrypted
  backup.

## Planned controls

- Private immutable attachment storage and content validation.
- Secure platform key storage and authenticated encrypted backups.
- Server authorization, private object storage, rate limiting, strict CORS, and secure sessions.
- Cross-user isolation, backup restoration, provider-contract, and synchronization-conflict tests.

## Unsupported claims

Reimbursd does not currently provide encrypted backups, end-to-end encryption, authentication,
hosted storage, synchronization, complete data deletion, secure deletion guarantees, OCR, or remote
AI processing. Product surfaces and documentation must not imply otherwise.
