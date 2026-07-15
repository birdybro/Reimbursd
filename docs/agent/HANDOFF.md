# Agent Handoff

## Repository state

Milestones 0 and 1 are complete. Milestone 2 has working camera/image/PDF selection, decoded content
validation, configurable limits, local SHA-256, global duplicate detection, immutable private file
storage, versioned document metadata, and original-file provenance UI. The web runtime loads both
the application and Expo SQLite's WASM worker successfully.

## Active direction

Use npm workspaces, strict TypeScript, Expo SDK 57, and framework-independent domain/database
packages. Milestone 2 remains active. The next work is derivative preview generation and physical
attachment cleanup/retry when a receipt is tombstoned. Preserve imported originals exactly; do not
add OCR, hosted processing, or synchronization yet.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Finish the highest-priority unchecked Milestone 2 task.
4. Run `npm run verify` before committing a logical slice or marking Milestone 2 complete.
