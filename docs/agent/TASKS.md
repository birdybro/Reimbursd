# Tasks

## Milestone 0: Repository foundation

- [x] Inspect the repository and record the empty baseline.
- [x] Add GPL-3.0-only licensing and third-party notices.
- [x] Establish a strict npm and TypeScript workspace.
- [x] Add a launchable Expo mobile application.
- [x] Add a framework-free domain package and focused unit tests.
- [x] Add format, lint, type-check, test, license, audit, Doctor, and build verification.
- [x] Add CI for the repository verification command.
- [x] Complete required architecture, product, privacy, security, and development documentation.
- [x] Run the complete quality gate and review the diff.

## Milestone 1: Local manual expense vertical slice

- [x] Define acceptance criteria and storage/privacy implications.
- [x] Add a tested SQLite migration and local receipt repository.
- [x] Add manual expense create, view, edit, and delete flows.
- [x] Persist integer minor-unit values across application restarts.
- [x] Add list search and basic filters.
- [x] Add unit, storage, and UI tests.

### Acceptance criteria for the current slice

- SQLite data is private to the application sandbox and requires no account or network service.
- Migrations are versioned, transactional, idempotent, and exercised against real SQLite.
- Receipt IDs are UUIDs; updates use versions to reject conflicting writes; deletion creates a
  tombstone.
- Merchant, purchase date, currency, subtotal, tax, tip, and total are editable.
- Stored money values are safe integer minor units, never floating-point amounts.
- List results survive database reopening and support merchant search plus currency filtering.
- UI loading, empty, validation, storage-error, detail, edit, and delete-confirmation states are
  accessible and recoverable.
- No telemetry, external processing, receipt files, or location data are introduced.

## Milestone 2: Receipt file ingestion

- [x] Define acceptance criteria and storage/privacy implications.
- [x] Add receipt-document metadata and versioned migrations.
- [x] Add private immutable original-file storage behind a platform port.
- [x] Validate image and PDF content, limits, and metadata before persistence.
- [x] Hash attachments and detect duplicates without external services.
- [x] Add camera, image selection, and PDF import workflows.
- [x] Generate bounded local previews for JPEG and PNG originals with distinct derivative metadata.
- [x] Preserve multi-page PDF metadata and document the deferred cross-platform page-preview gap.
- [x] Add native/web storage-adapter coverage alongside core, SQLite, coordinator, and UI tests.
- [x] Remove attachment bytes when a receipt is deleted and provide cleanup retry behavior.

### Acceptance criteria for the current slice

- Original image and PDF bytes are copied into private application storage before processing and are
  never modified in place.
- SQLite stores document metadata and opaque storage references, not full attachment BLOBs.
- Content signatures are validated instead of trusting filenames or picker MIME types.
- Configurable byte-size, page-count, and image-dimension limits fail with recoverable errors.
- SHA-256 hashes are calculated locally and used to detect duplicate attachments.
- Multi-page PDF page counts and original filenames are preserved as metadata.
- Derivatives have separate records or explicit parent/original metadata and cannot replace the
  original.
- Camera and picker permissions are requested only when their workflow is invoked.
- Import failures leave existing expenses and originals intact and transmit no receipt data.

### Deferred ingestion enhancement

- [ ] Generate bounded PDF page previews when a mature offline renderer supports Expo Android, iOS,
      and web without weakening the current Expo workflow.

## Milestone 3: OCR, extraction, and review

- [x] Define field-evidence and processing-history domain models.
- [x] Add versioned local persistence for evidence and processing history.
- [x] Define the OCR provider contract and deterministic test provider.
- [x] Add an offline-capable Apple Vision provider for iOS development and release builds.
- [x] Parse receipt text into candidate merchant, date, currency, subtotal, tax, tip, and total
      fields.
- [x] Add review UI with confidence and local/remote provenance.
- [x] Preserve accepted user corrections across later processing runs.
- [x] Highlight source regions when bounding boxes and a local image preview are available.

### Acceptance criteria for the current milestone

- OCR and parsing are separate interfaces and neither depends on generative AI.
- Provider input and output are validated, bounded, and treated as untrusted data.
- A deterministic provider supports tests without a network service or device OCR runtime.
- Processing attempts record local/remote execution, processor version, timing, status, and redacted
  failures without storing receipt text in logs.
- Suggested values remain distinct from confirmed receipt fields until the user accepts them.
- Parser candidates are validated and persisted atomically as unaccepted evidence after OCR history
  completes; parser or evidence failures do not change the successful OCR result.
- Review prefills normalized suggestions without changing saved values until save. Receipt updates,
  evidence decisions, user-correction evidence, and parser review status commit or roll back together.
- Accepted suggestions and user corrections outrank later unreviewed automation.
- Supported iOS builds run OCR through an operating-system framework without a hosted service;
  Android, web, and Expo Go fail gracefully without reading bytes or invoking a remote fallback.

## Milestone 4: Categories, reporting, and exports

- [x] Define category and tag domain models plus migration implications.
- [x] Add local category/tag persistence with versions, tombstones, and duplicate protection.
- [x] Add atomic receipt category/tag assignment and unassignment.
- [x] Add accessible local category/tag creation and assignment UI on expense details.
- [x] Expand filters for date, merchant, category, tag, and amount.
- [x] Add monthly and category totals.
- [x] Add account-free CSV export for common active-expense fields.
- [x] Add complete structured export with attachment checksums.
- [ ] Add clean-install restore and round-trip coverage.
- [ ] Add complete local data deletion with attachment cleanup.
- [x] Document the open export format.

### Acceptance criteria for the restore slice

- ZIP parsing rejects traversal, duplicate, oversized, unsupported, and malformed archive entries.
- Manifest, schema, JSON record, relationship, byte-size, and SHA-256 validation completes before
  any local write begins.
- Restore is limited to a clean local database and private attachment store, with no silent merge or
  overwrite behavior.
- Structured records commit atomically and attachment writes are rolled back or durably recoverable
  after failure.
- Export, local deletion, restore, and reload preserve corrected values, provenance, classifications,
  document metadata, and byte-identical selected originals in a round-trip test.
