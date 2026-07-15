# Agent Handoff

## Repository state

The repository began with only `AGENTS.md` and a one-line `README.md`. Milestone 0 is complete and
`npm run verify` passes. Git was clean before implementation; the current uncommitted files are the
Milestone 0 work.

## Active direction

Use npm workspaces, strict TypeScript, Expo SDK 57, and a framework-independent domain package.
Milestone 1 is active. Add local manual-expense persistence using versioned SQLite migrations,
integer minor-unit amounts, tombstones, and optimistic versions. Do not add hosted dependencies
before the local manual-expense milestone is complete.

## Resume steps

1. Read `AGENTS.md`, `docs/agent/STATUS.md`, and `docs/agent/TASKS.md`.
2. Inspect `git status --short` and preserve uncommitted work.
3. Finish the highest-priority unchecked Milestone 1 task.
4. Run `npm run verify` before marking Milestone 1 complete.
