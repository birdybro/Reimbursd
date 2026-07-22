# Development

## Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer
- Git
- An Expo-supported Android, iOS, or web environment
- Docker for PostgreSQL and MinIO integration tests and hosted-service development

No environment variable, external database, container, hosted account, or paid provider is needed
for the local mobile application. It creates and migrates its local SQLite database when it starts.
Local receipt imports support JPEG, PNG, and unencrypted PDF content up to the configured resource
limits.

## Setup

```sh
npm install
npm run dev:mobile
```

The Expo terminal provides shortcuts for a web browser and locally configured Android or iOS
targets. Web SQLite uses a worker and origin-private browser storage; the Metro configuration sends
the cross-origin isolation headers required by the SQLite WASM runtime. Web attachment bytes use the
origin-private file system and are isolated to the current origin/profile. Native attachment bytes
use Expo's private application document directory.

Expo Go and web exercise the local expense and ingestion workflows but do not contain Reimbursd's
Apple Vision OCR module. Use `npm run ios:native --workspace @reimbursd/mobile` on macOS to generate
and launch an iOS development build with on-device OCR. The module is discovered through Expo local
module autolinking. Android currently records OCR as unavailable and keeps the imported receipt
usable; no external fallback is used.

## Commands

- `npm run dev:mobile`: start the Expo development server.
- `npm run dev:api`: start the process-local Milestone 6 API after configuring `.env` as documented
  in `docs/SELF_HOSTING.md`.
- `npm run dev:web`: start the loopback Vite hosted-web client on `http://127.0.0.1:4173`; its
  same-origin `/api` proxy expects the development API on `http://127.0.0.1:3000` by default.
- `npm run dev:worker`: start the PostgreSQL-backed Milestone 6 worker after configuring `.env` as
  documented in `docs/SELF_HOSTING.md`.
- `npm run android:native --workspace @reimbursd/mobile`: generate and run an Android development
  build; local OCR is not implemented on Android yet.
- `npm run ios:native --workspace @reimbursd/mobile`: generate and run an iOS development build with
  the local Apple Vision module; requires macOS and Xcode.
- `npm run format`: format supported source and documentation.
- `npm run lint`: lint all workspaces.
- `npm run typecheck`: run strict TypeScript checks.
- `npm test`: run domain and real-SQLite integration tests with Vitest.
- `npm run test:ui`: run React Native interaction tests with Jest and Testing Library.
- `npm run build`: build each implemented workspace.
- `npm run doctor`: validate Expo configuration and native dependency compatibility.
- `npm run licenses`: reject missing or incompatible dependency licenses.
- `npm run audit`: fail on known high-severity npm advisories.
- `npm run verify`: run the complete practical repository quality gate.

The current API uses strict request schemas, signed development bearer tokens, rate limiting,
generated OpenAPI, and explicit owner-scoped repository operations. Without
`REIMBURSD_DATABASE_URL`, its records are held only in process memory and disappear at restart. With
a PostgreSQL URL, startup applies transactional, advisory-locked migrations and uses durable
owner-scoped receipt storage. Configuring every `REIMBURSD_OBJECT_*` value enables bounded original
attachment upload and authenticated proxy download through private S3-compatible storage. Object
storage is rejected without PostgreSQL metadata. Production configuration requires PostgreSQL.
Development identity issuance is still not production authentication. Keep the API and object store
bound to loopback. The web client keeps its 15-minute bearer token only in React memory and reaches
the API through Vite's same-origin `/api` proxy, so API CORS remains disabled. Vite development CSS
requires an inline-style CSP allowance while the development server is running; the production
artifact retains `style-src 'self'`. A production reverse proxy, authentication system, session
policy, and response-header CSP are not implemented.

The root test and verification commands start disposable `postgres:16-alpine` and pinned MinIO
containers through Testcontainers. Docker must be running. Tests use synthetic credentials and stop
their containers after the suite.

The worker requires `REIMBURSD_DATABASE_URL`. It owns a namespaced `pg-boss` schema, uses
`LISTEN`/`NOTIFY` with polling fallback, and proves startup by completing one strictly validated
synthetic readiness job. The initial job contains only a schema version and generated UUID. It is a
durable worker foundation, not receipt processing; no hosted OCR, AI, email, geocoding, billing, or
cleanup handler is registered.

Use synthetic test data only. Mobile data is stored in the platform application sandbox. Web data
and receipt files are stored for the current browser origin and profile. Removing browser site data
or uninstalling the application can remove this data. Plain complete export, clean-install restore,
explicit local delete-all, and authenticated encrypted backup are implemented. Android and iOS use
Expo SecureStore for the active backup key; web keys remain in memory only. Always retain the
displayed recovery key separately because uninstall, device loss, or secure-storage loss can make a
backup unrecoverable. The encrypted file does not encrypt live local storage.
