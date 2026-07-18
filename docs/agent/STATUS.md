# Agent Status

- Current milestone: Milestone 4 - Categories, reporting, and exports
- Current task: Add complete local data deletion with coordinated attachment cleanup.
- Last completed task: Added strict current-schema complete-archive parsing and clean-install restore
  with immutable attachment coordination, transactional structured-data insertion, compensating
  cleanup, redacted recovery UI, and export/parse/restore round-trip coverage.
- Commands executed: Ran targeted Prettier, mobile/export/database TypeScript checks, structured
  archive/parser/import/coordinator/picker Vitest tests, React Native/Jest expense-screen tests, diff
  checks, and the complete `npm run verify` quality gate.
- Test and build status: `npm run verify` passes. One hundred forty-four Vitest tests and forty React
  Native/Jest interaction, coordinator, parser, repository, and storage-adapter tests pass. Strict
  type checking, linting, formatting, license checks, the high-severity audit threshold, Expo Doctor
  20/20, all workspace builds, and the production Expo web export pass.
- Current assumptions: npm workspaces, Expo SDK 57, framework-free domain/export packages, the
  portable SQLite repository boundary, MIT-licensed in-process `fflate` ZIP handling, and strict
  Zod archive schemas remain appropriate. Attachment bytes live in private platform or origin
  storage, with only validated metadata and canonical storage references in SQLite. Format version
  1 restore targets only the current schema and an empty local database.
- Known defects: Android/web OCR, PDF page previews, category/tag rename/delete UI, complete local
  data deletion, and encrypted backup are not implemented. Derivative previews are not included in
  format version 1 archives and are not regenerated immediately after restore. Deterministic parsing
  will not cover every receipt layout or language. Image ingestion currently supports JPEG and PNG,
  not HEIC or WebP. Native Android/iOS launch, native sharing/restore, and Apple Vision execution were
  not exercised in this Linux environment. Expo SDK 57 carries eleven moderate build-tool
  advisories; there are no high or critical advisories, and npm's suggested fix includes an
  incompatible Expo Sharing downgrade.
- Current blockers: None.
- Next task: Implement an explicit, recoverable delete-all workflow for every local structured table
  and attachment, then cover export-delete-restore round-trip behavior.
