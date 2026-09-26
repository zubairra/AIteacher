# OpenMAIC known test failures

This ledger separates the upstream/Windows baseline from regressions introduced by the teacher-platform work. It is not a waiver for new failures.

## Phase 0 baseline

- Date recorded: 2026-09-25
- Branch/commit: `feature/teacher-smartboard` at `9e0b6a6f`
- Environment: Windows, Node 22-compatible workspace, repository-pinned pnpm 10.28.0
- Broad Vitest result: **8,682 passed, 104 failed, 98 skipped**
- TypeScript: passed
- ESLint: passed with 20 warnings and no errors
- Prettier check: passed
- Production build: passed

The 104 failures were already present before Phases 1–2. Phase 0 classified them as upstream/Windows-related; they are outside the teacher-platform scope. When the broad suite is rerun, compare the failing test identities as well as totals. Any newly failing test in a changed teacher, generation, persistence, editor, or routing area is a regression and must be fixed.

## Phase 1–2 focused coverage

Teacher-platform tests live in `tests/teacher/` and cover:

- lesson request validation and normalized duration;
- the typed request-to-requirement compiler;
- distinct teaching-style and pacing guidance;
- explicit teacher-led generation context;
- bounded, versioned teacher notes;
- metadata serialization and malformed/legacy data handling;
- dashboard list mapping for teacher and legacy lessons.

Final Phase 1–2 command results are recorded in `docs/teacher-platform-phase-1-2.md`.

## Phase 1–2 comparison

- Broad Vitest result: **8,690 passed, 104 failed, 98 skipped**.
- Delta from Phase 0: **+8 passed, +0 failed, +0 skipped**.
- The 104 failures remain in the recorded Windows shell, PGlite/WASM, timing-sensitive, and environment-specific groups; no `tests/teacher` test failed.
- The generation package passed 198 of 199 tests. Its sole failure is the existing Windows path-separator assertion in `test/assets.test.ts`; all legacy prompt goldens passed.
- The storage package's failures were PGlite/WASM initialization and timeout failures consistent with the Windows baseline. The package typecheck passed.
