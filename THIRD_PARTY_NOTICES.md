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
permissive licenses. `pdf-lib` 1.17.1 is installed under the MIT license to decode supported images,
validate PDFs, and obtain PDF page counts. Its self-contained ESM distribution includes TypeScript
helper code under the Apache-2.0 license; the installed package preserves its notices.

## Development license data

The development dependency graph includes permissive packages under the Blue Oak Model License
1.0.0 and license metadata under Creative Commons Attribution 3.0 and 4.0. The relevant complete
terms are available from:

- <https://blueoakcouncil.org/license/1.0.0>
- <https://creativecommons.org/licenses/by/3.0/legalcode>
- <https://creativecommons.org/licenses/by/4.0/legalcode>

These packages are not bundled as Reimbursd application source, and their copyright and license
metadata remain intact in the installed dependency graph.
