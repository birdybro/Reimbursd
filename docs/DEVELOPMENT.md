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

Expo Go and web exercise the local expense and ingestion workflows but do not contain Reimbursd's
Apple Vision OCR module. Use `npm run ios:native --workspace @reimbursd/mobile` on macOS to generate
and launch an iOS development build with on-device OCR. The module is discovered through Expo local
module autolinking. Android currently records OCR as unavailable and keeps the imported receipt
usable; no external fallback is used.

## Commands

- `npm run dev:mobile`: start the Expo development server.
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

Use synthetic test data only. Mobile data is stored in the platform application sandbox. Web data
and receipt files are stored for the current browser origin and profile. Removing browser site data
or uninstalling the application can remove this data. Plain complete export, clean-install restore,
explicit local delete-all, and authenticated encrypted backup are implemented. Android and iOS use
Expo SecureStore for the active backup key; web keys remain in memory only. Always retain the
displayed recovery key separately because uninstall, device loss, or secure-storage loss can make a
backup unrecoverable. The encrypted file does not encrypt live local storage.
