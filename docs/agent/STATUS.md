# Agent Status

- Current milestone: Milestone 4 - Categories, reporting, and exports
- Current task: Add CSV and complete structured local export with attachment checksums.
- Last completed task: Added validated, transactional monthly and category totals, with currencies
  kept separate, receipt tombstones excluded, and an accessible local reports route.
- Commands executed: Targeted Prettier, ESLint, database/mobile TypeScript, SQLite reporting tests,
  React Native/Jest report and navigation tests; complete `npm run verify`.
- Test and build status: `npm run verify` passes. One hundred twelve Vitest tests and thirty-one React
  Native/Jest interaction, coordinator, parser, repository, and storage-adapter tests pass. Strict
  type checking, linting, formatting, license checks, the high-severity audit threshold, Expo Doctor
  20/20, all workspace builds, the production Expo web export, and the live web/SQLite worker
  runtime pass.
- Current assumptions: npm workspaces, Expo SDK 57, the framework-free domain package, and the
  portable SQLite repository boundary remain appropriate. Attachment bytes live in private platform
  or origin storage, with only validated metadata and storage references in SQLite.
- Known defects: Android/web OCR, PDF page previews, category/tag rename/delete UI, attachment
  backup/export, restore, and complete data deletion are not implemented. Deterministic parsing will
  not cover every receipt layout or language. Image ingestion currently supports JPEG and PNG, not
  HEIC or WebP. Native Android/iOS launch and Apple Vision execution were not exercised in this Linux
  environment. Expo SDK 57 carries ten moderate build-tool advisories; there are no high or critical
  advisories, and npm's suggested fix is an invalid downgrade to Expo SDK 46.
- Current blockers: None.
- Next task: Define the versioned export package boundary and implement account-free CSV export.
