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
- [ ] Add a tested SQLite migration and local receipt repository.
- [ ] Add manual expense create, view, edit, and delete flows.
- [ ] Persist integer minor-unit values across application restarts.
- [ ] Add list search and basic filters.
- [ ] Add unit, storage, and UI tests.

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
