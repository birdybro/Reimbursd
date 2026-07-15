# Agent Handoff

## Repository state

Milestones 0 and 1 are complete, and `npm run verify` passes. The Expo application provides local
manual expense create, view, edit, delete, search, and currency filtering over versioned SQLite.
The shared repository is tested against real SQLite, and the web runtime loads Expo SQLite's WASM
worker successfully.

## Active direction

Use npm workspaces, strict TypeScript, Expo SDK 57, and framework-independent domain/database
packages. Milestone 2 is active. Preserve imported originals immutably in private application file
storage, keep only metadata and storage references in SQLite, validate file content and limits, and
calculate hashes locally. Do not add OCR, hosted processing, or synchronization yet.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Finish the highest-priority unchecked Milestone 2 task.
4. Run `npm run verify` before committing a logical slice or marking Milestone 2 complete.
