# Agent Status

- Current milestone: Milestone 4 - Categories, reporting, and exports
- Current task: Add the versioned complete structured local export with attachment checksums.
- Last completed task: Added deterministic account-free CSV export with integer-safe amounts,
  formula hardening, direct web download, native share-sheet delivery, and temporary-file cleanup.
- Commands executed: Expo dependency installation; targeted Prettier, ESLint, domain/mobile
  TypeScript, Vitest CSV/coordinator tests, React Native/Jest platform-writer and UI tests; complete
  `npm run verify`.
- Test and build status: `npm run verify` passes. One hundred eighteen Vitest tests and thirty-six
  React Native/Jest interaction, coordinator, parser, repository, and storage-adapter tests pass. Strict
  type checking, linting, formatting, license checks, the high-severity audit threshold, Expo Doctor
  20/20, all workspace builds, the production Expo web export, and the live web/SQLite worker
  runtime pass.
- Current assumptions: npm workspaces, Expo SDK 57, the framework-free domain package, and the
  portable SQLite repository boundary remain appropriate. Attachment bytes live in private platform
  or origin storage, with only validated metadata and storage references in SQLite.
- Known defects: Android/web OCR, PDF page previews, category/tag rename/delete UI, complete
  attachment export, restore, and complete data deletion are not implemented. Deterministic parsing
  will not cover every receipt layout or language. Image ingestion currently supports JPEG and PNG,
  not HEIC or WebP. Native Android/iOS launch, native sharing, and Apple Vision execution were not
  exercised in this Linux environment. Expo SDK 57 carries eleven moderate build-tool advisories;
  there are no high or critical advisories, and npm's suggested fix includes an incompatible Expo
  Sharing downgrade.
- Current blockers: None.
- Next task: Define versioned manifest/record schemas and assemble structured export files locally.
