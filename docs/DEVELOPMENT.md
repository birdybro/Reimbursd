# Development

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Git
- An Expo-supported Android, iOS, or web environment

No environment variable, database, container, hosted account, or paid provider is needed for the
current mobile foundation.

## Setup

```sh
npm install
npm run dev:mobile
```

The Expo terminal provides shortcuts for a web browser and locally configured Android or iOS
targets.

## Commands

- `npm run dev:mobile`: start the Expo development server.
- `npm run format`: format supported source and documentation.
- `npm run lint`: lint all workspaces.
- `npm run typecheck`: run strict TypeScript checks.
- `npm test`: run unit tests.
- `npm run build`: build each implemented workspace.
- `npm run doctor`: validate Expo configuration and native dependency compatibility.
- `npm run licenses`: reject missing or incompatible dependency licenses.
- `npm run audit`: fail on known high-severity npm advisories.
- `npm run verify`: run the complete practical repository quality gate.

Use synthetic test data only. The current baseline before bootstrapping had no development commands
or build configuration.
