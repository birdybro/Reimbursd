# Agent Handoff

## Repository state

Milestones 0 through 2 are complete. Receipt ingestion has working camera/image/PDF selection,
decoded content validation, configurable limits, local SHA-256, global duplicate detection,
immutable private file storage, versioned document metadata, original-file provenance UI, and
durable attachment cleanup after receipt deletion. JPEG and PNG imports also receive bounded,
separately stored local previews. The web runtime loads both the application and Expo SQLite's WASM
worker successfully.

## Active direction

Use npm workspaces, strict TypeScript, Expo SDK 57, and framework-independent domain/database
packages. Milestone 3 is active. The next work is validated field evidence, processing history, and
an OCR provider boundary with deterministic local tests. Preserve imported originals exactly and do
not add hosted processing, synchronization, or generative AI.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Finish the highest-priority unchecked Milestone 2 task.
4. Run `npm run verify` before committing a logical slice or marking Milestone 2 complete.
