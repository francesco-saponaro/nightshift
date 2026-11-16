# inc-ec6c6789: daysLeft for 2026-11-17 is 0 but the calendar says 1 at 2026-11-16T20:21:49.245Z

Opened by Nightshift for incident `inc-ec6c6789` (posthog), run `0cf61b5a-9861-4d6b-ae3e-1688ee76efeb`. This run was a dry run: the agent's turns were replayed from a recorded transcript and its edits applied as patches; the reproduction, the verification and the gates ran for real on this branch.

## The incident

- What: daysLeft for 2026-11-17 is 0 but the calendar says 1 at 2026-11-16T20:21:49.245Z
- Where: `POST /api/todos`
- When: 2026-11-16T20:21:49.259Z, release `sample@0.1.0`, production
- Flag: `sample.bugs: date-off-by-one`

## The reproduction

`apps/sample/test/incident-inc-ec6c6789.test.ts`, run with the flag on, failed on the unfixed code (exit 1) and passes after the fix.

```
× counts a to-do due tomorrow as 1 day away at 20:21 2862ms
× counts a to-do due today as 0, not overdue, at the same hour 1917ms
FAIL  |sample| test/incident-inc-ec6c6789.test.ts > incident inc-ec6c6789: the day count after midday > counts a to-do due tomorrow as 1 day away at 20:21
AssertionError: expected +0 to be 1 // Object.is equality
FAIL  |sample| test/incident-inc-ec6c6789.test.ts > incident inc-ec6c6789: the day count after midday > counts a to-do due today as 0, not overdue, at the same hour
AssertionError: expected -1 to be +0 // Object.is equality
Test Files  1 failed (1)
Tests  2 failed (2)
```

## The fix

4 files, +31 −6, 1 new, on `nightshift/inc-ec6c6789` from `a71b4a9f1a`.

- `apps/sample/src/server/app.ts`
- `apps/sample/src/server/dates.ts`
- `apps/sample/src/server/flags.ts`
- `apps/sample/test/incident-inc-ec6c6789.test.ts`

## Verification

| Command | Result |
| --- | --- |
| `pnpm -C apps/sample test` | passed in 31.4s |
| `SAMPLE_BUGS=date-off-by-one pnpm -C apps/sample test:e2e` | passed in 8.3s |
| `pnpm -C apps/sample test:e2e` | passed in 8.1s |
| `pnpm -r typecheck` | passed in 8.1s |
| `pnpm lint` | passed in 2.9s |

## The gates

Review: `APPROVED`

- 13: the reproduction's header comment names the browser report and the time of day; keep that habit.
- 15: the react skill does not apply (no .tsx touched); simple is judged next.

Simplicity: `SIMPLE — 4 files, +31 −6, 1 new file; 0 helpers, 0 types, 0 dependencies, 0 config changes; longest file touched 112 lines.`

Mechanical findings: none.

## Seen, not touched

- dueLabel in dates.ts still says "overdue by 1 day" for -1; the label reads fine, but the phrase "due yesterday" would match the other labels.

## Before merging

Auto-merge is off. A person reads the title, the fix and the verification table, and merges.

Every step of the run, with the agent's messages redacted, is on the Nightshift dashboard under incident `inc-ec6c6789`.
