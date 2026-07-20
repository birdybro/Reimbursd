# Third-Party Notices

Reimbursd is licensed under `GPL-3.0-only`. Its npm dependencies remain under their respective
licenses.

The authoritative machine-readable dependency inventory is `package-lock.json`. Run
`npm run licenses` to validate installed package licenses and `npm query "*"` to inspect dependency
metadata. Direct dependencies and their licenses are reviewed whenever the lockfile changes.

## Expo blank template assets

The initial application icon and splash bitmap assets are from `expo-template-blank` 57.0.6,
copyright Expo and contributors, under the 0BSD license. Its complete notice is preserved at
`apps/mobile/assets/LICENSE.expo-template`.

No third-party source code or personal receipt fixtures are vendored in the repository. Expo
SQLite, Crypto, FileSystem, ImagePicker, ImageManipulator, DocumentPicker, Jest Expo, and React
Native Testing Library are installed through the locked npm dependency graph under their published
permissive licenses. Expo Sharing is installed under the MIT license to hand locally generated CSV
and backup files to the native operating-system share sheet. Expo SecureStore 57.0.1 is installed
under the MIT license to retain the small encrypted-backup key record in supported Android and iOS
platform secure storage. Expo Crypto supplies the platform AES-GCM implementation. `pdf-lib` 1.17.1
is installed under the MIT license to decode supported images, validate PDFs, and obtain PDF page
counts. Its self-contained
ESM distribution includes TypeScript helper code under the Apache-2.0 license; the installed package
preserves its notices. `fflate` 0.8.3 is installed under the MIT license to create local ZIP archives
and strictly extract selected archives without a network service; the installed package preserves
its license metadata. `zod` 3.25.76 is installed under the MIT license to strictly validate untrusted
structured-export manifests and record files before restore; the installed package preserves its
license metadata. The Milestone 6 API uses Fastify 5 and the official `@fastify/jwt`,
`@fastify/rate-limit`, and `@fastify/swagger` plugins under the MIT license for HTTP routing,
development bearer-token verification, request throttling, and generated OpenAPI documentation.
`tsx` is installed under the MIT license for local TypeScript server execution. The installed
packages preserve their license and copyright metadata. `pg` and `@types/pg` are installed under the
MIT license for PostgreSQL access and typing. The MIT-licensed Testcontainers PostgreSQL module runs
integration tests against a disposable PostgreSQL 16 container; its locked transitive dependencies
and notices remain in `package-lock.json` and the installed packages. PostgreSQL container images
are distributed by the PostgreSQL project under the PostgreSQL License and are not bundled into
Reimbursd source or application artifacts.

## Development license data

The development dependency graph includes permissive packages under the Blue Oak Model License
1.0.0 and license metadata under Creative Commons Attribution 3.0 and 4.0. The relevant complete
terms are available from:

- <https://blueoakcouncil.org/license/1.0.0>
- <https://creativecommons.org/licenses/by/3.0/legalcode>
- <https://creativecommons.org/licenses/by/4.0/legalcode>

These packages are not bundled as Reimbursd application source, and their copyright and license
metadata remain intact in the installed dependency graph.

## Platform frameworks

The optional iOS OCR implementation invokes Apple's Vision and UIKit frameworks supplied by the
operating system. Reimbursd does not vendor those frameworks or add a third-party OCR SDK. The
adapter source in this repository is licensed `GPL-3.0-only`.
