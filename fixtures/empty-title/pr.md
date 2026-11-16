# inc-f42f2815: new row for relation "todos" violates check constraint "todos_title_not_blank"

Opened by Nightshift for incident `inc-f42f2815` (sentry), run `6fe1656a-caf6-4638-a624-43669228dd76`. This run was a dry run: the agent's turns were replayed from a recorded transcript and its edits applied as patches; the reproduction, the verification and the gates ran for real on this branch.

## The incident

- What: new row for relation "todos" violates check constraint "todos_title_not_blank"
- Where: `POST /api/todos` with body `{"title":"","dueOn":"2026-11-16"}`
- When: 2026-11-15T22:27:07.773Z, release `sample@0.1.0`, production
- Flag: `sample.bugs: empty-title`

## The reproduction

`apps/sample/test/incident-inc-f42f2815.test.ts`, run with the flag on, failed on the unfixed code (exit 1) and passes after the fix.

```
× is refused with a 400 that names the title, not a 500 from the database 2642ms
× treats a title of spaces the same way 1680ms
FAIL  |sample| test/incident-inc-f42f2815.test.ts > incident inc-f42f2815: an empty title on POST /api/todos > is refused with a 400 that names the title, not a 500 from the database
AssertionError: expected 500 to be 400 // Object.is equality
FAIL  |sample| test/incident-inc-f42f2815.test.ts > incident inc-f42f2815: an empty title on POST /api/todos > treats a title of spaces the same way
Test Files  1 failed (1)
Tests  2 failed (2)
```

## The fix

3 files, +34 −10, 1 new, on `nightshift/inc-f42f2815` from `a71b4a9f1a`.

- `apps/sample/src/server/app.ts`
- `apps/sample/src/server/flags.ts`
- `apps/sample/test/incident-inc-f42f2815.test.ts`

## Verification

| Command | Result |
| --- | --- |
| `pnpm -C apps/sample test` | passed in 30.3s |
| `SAMPLE_BUGS=empty-title pnpm -C apps/sample test:e2e` | passed in 8.3s |
| `pnpm -C apps/sample test:e2e` | passed in 8.2s |
| `pnpm -r typecheck` | passed in 9.1s |
| `pnpm lint` | passed in 3.0s |

## The gates

Review: `APPROVED`

- 13: the reproduction's header comment explains the incident; keep that habit.
- 15: the react skill does not apply (no .tsx touched); simple is judged next.

Simplicity: `SIMPLE — 3 files, +34 −10, 1 new file; 0 helpers, 0 types, 0 dependencies, 0 config changes; longest file touched 108 lines.`

Mechanical findings: none.

## Before merging

Auto-merge is off. A person reads the title, the fix and the verification table, and merges.

Every step of the run, with the agent's messages redacted, is on the Nightshift dashboard under incident `inc-f42f2815`.
