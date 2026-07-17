# Agent Status

- Current milestone: Milestone 3 - OCR, extraction, and review
- Current task: Parse validated OCR text into reviewable deterministic receipt-field candidates.
- Last completed task: Added a GPL-licensed Apple Vision OCR module, bounded native adapter, private
  cache cleanup, nonfatal orchestration, processing status UI, and unavailable-runtime behavior.
- Commands executed: OCR dependency and license evaluation; package installation and removal;
  targeted Prettier, ESLint, TypeScript, Jest, Expo configuration, and Expo module autolinking;
  Expo SDK-compatible patch updates; production and live web builds; complete `npm run verify`;
  Expo web runtime on port 8081.
- Test and build status: `npm run verify` passes. Seventy-six Vitest tests and twenty-four React
  Native/Jest interaction, coordinator, and storage-adapter tests pass. Strict type checking,
  linting, formatting, license checks, the high-severity audit threshold, Expo Doctor 20/20, all
  workspace builds, the production Expo web export, and the live Firefox/SQLite worker runtime pass.
- Current assumptions: npm workspaces, Expo SDK 57, the framework-free domain package, and the
  portable SQLite repository boundary remain appropriate. Attachment bytes live in private platform
  or origin storage, with only validated metadata and storage references in SQLite.
- Known defects: Deterministic extraction/review, Android/web OCR, PDF page previews, attachment
  backup/export, and complete data deletion are not implemented. Image ingestion currently supports
  JPEG and PNG, not HEIC or WebP. Native Android/iOS launch and Apple Vision execution were not
  exercised in this Linux environment. Headless Firefox screenshot
  capture is blocked by the current Wayland compositor. Expo SDK 57 carries ten moderate build-tool
  advisories; there are no high or critical advisories, and npm's suggested fix is an invalid
  downgrade to Expo SDK 46.
- Current blockers: None.
- Next task: Implement deterministic merchant, date, currency, subtotal, tax, tip, and total parsing
  as a separate layer and persist its candidates as unaccepted field evidence.
