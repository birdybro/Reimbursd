# Development

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Git
- An Expo-supported Android, iOS, or web environment

No environment variable, external database, container, hosted account, or paid provider is needed.
The application creates and migrates its local SQLite database when it starts. Local receipt imports
support JPEG, PNG, and unencrypted PDF content up to the configured resource limits.

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

## Commands

- `npm run dev:mobile`: start the Expo development server.
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

Use synthetic test data only. Mobile data is stored in the platform application sandbox. Web data
and receipt files are stored for the current browser origin and profile. Removing browser site data
or uninstalling the application can remove this data; backup and restore are not implemented yet.
