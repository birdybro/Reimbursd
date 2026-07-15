# Security Model

## Implemented controls

- Strict TypeScript and automated formatting, linting, testing, build, license, and audit gates.
- Locked npm dependency graph.
- No production credentials, analytics, external AI, location access, or hosted data path.
- Integer minor-unit money rules in the framework-free domain package.
- Public GPLv3 license and explicit current-capability documentation.

## Partially implemented controls

- Dependency security is checked through npm advisories. Expo SDK 57 currently brings ten moderate
  build-tool advisories through Expo configuration and `xcode`; no high or critical advisory is
  present, and npm's proposed remediation is an invalid downgrade to Expo SDK 46. Automated secret
  scanning and a generated SBOM will be added to CI as tooling is selected.
- Data validation currently covers domain primitives only because storage and import boundaries do
  not yet exist.

## Planned controls

- SQLite migrations and rollback tests.
- Private immutable attachment storage and content validation.
- Secure platform key storage and authenticated encrypted backups.
- Server authorization, private object storage, rate limiting, strict CORS, and secure sessions.
- Cross-user isolation, backup restoration, provider-contract, and synchronization-conflict tests.

## Unsupported claims

Reimbursd does not currently provide encrypted backups, end-to-end encryption, authentication,
hosted storage, synchronization, secure deletion guarantees, OCR, or remote AI processing. Product
surfaces and documentation must not imply otherwise.
