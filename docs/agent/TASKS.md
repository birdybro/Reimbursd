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
- [ ] Add receipt-document metadata and versioned migrations.
- [ ] Add private immutable original-file storage behind a platform port.
- [ ] Validate image and PDF content, limits, and metadata before persistence.
- [ ] Hash attachments and detect duplicates without external services.
- [ ] Add camera, image selection, and PDF import workflows.
- [ ] Distinguish original files from generated previews and thumbnails.
- [ ] Add unit, storage, provider-boundary, and UI tests.

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
