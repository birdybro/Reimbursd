# Agent Status

- Current milestone: Milestone 3 - OCR, extraction, and review
- Current task: Add accept and correct actions that keep user-reviewed evidence authoritative.
- Last completed task: Added validated deterministic merchant/date/currency/amount parsing, atomic
  candidate persistence, separate parser history, confidence/provenance review UI, and source-region
  highlighting on local image previews.
- Commands executed: Targeted Prettier, ESLint, workspace TypeScript, Vitest, and React Native/Jest;
  full Vitest and Jest suites; cold Expo web restart and live HTTP/app/SQLite worker bundle checks;
  complete `npm run verify`.
- Test and build status: `npm run verify` passes. Eighty-four Vitest tests and twenty-five React
  Native/Jest interaction, coordinator, parser, repository, and storage-adapter tests pass. Strict
  type checking, linting, formatting, license checks, the high-severity audit threshold, Expo Doctor
  20/20, all workspace builds, the production Expo web export, and the live web/SQLite worker
  runtime pass.
- Current assumptions: npm workspaces, Expo SDK 57, the framework-free domain package, and the
  portable SQLite repository boundary remain appropriate. Attachment bytes live in private platform
  or origin storage, with only validated metadata and storage references in SQLite.
- Known defects: Accepting/correcting extracted suggestions, Android/web OCR, PDF page previews,
  attachment backup/export, and complete data deletion are not implemented. Deterministic parsing
  will not cover every receipt layout or language. Image ingestion currently supports JPEG and PNG,
  not HEIC or WebP. Native Android/iOS launch and Apple Vision execution were not exercised in this
  Linux environment. Headless Firefox screenshot capture is blocked by the current Wayland
  compositor. Expo SDK 57 carries ten moderate build-tool advisories; there are no high or critical
  advisories, and npm's suggested fix is an invalid downgrade to Expo SDK 46.
- Current blockers: None.
- Next task: Implement atomic acceptance/correction of suggested fields and update parser review
  history without allowing later automation to supersede user decisions.
