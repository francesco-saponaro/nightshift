# inc-aef82d2a: duplicate key value violates unique constraint "todos_client_key"

Opened by Nightshift for incident `inc-aef82d2a` (sentry), run `6867c0fe-fd9b-4906-bc7d-04710e0d25e8`. This run was a dry run: the agent's turns were replayed from a recorded transcript and its edits applied as patches; the reproduction, the verification and the gates ran for real on this branch.

## The incident

- What: duplicate key value violates unique constraint "todos_client_key"
- Where: `POST /api/todos` with body `{"title":"Book the dentist","dueOn":null,"clientKey":"3f2c9a4e-7d1b-4c8e-9a0f-6b5d4e3c2a1b"}`
- When: 2026-11-16T20:17:53.310Z, release `sample@0.1.0`, production
- Flag: `sample.bugs: double-submit`

## The reproduction

`apps/sample/test/incident-inc-aef82d2a.test.ts`, run with the flag on, failed on the unfixed code (exit 1) and passes after the fix.

```
× creates one to-do and answers both requests with it, nothing reported 2505ms
FAIL  |sample| test/incident-inc-aef82d2a.test.ts > incident inc-aef82d2a: the same client key twice at once > creates one to-do and answers both requests with it, nothing reported
AssertionError: expected [ 201, 500 ] to deeply equal [ 200, 201 ]
Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

## The fix

4 files, +40 −10, 1 new, on `nightshift/inc-aef82d2a` from `a71b4a9f1a`.

- `apps/sample/src/server/app.ts`
- `apps/sample/src/server/flags.ts`
- `apps/sample/src/server/store.ts`
- `apps/sample/test/incident-inc-aef82d2a.test.ts`

## Verification

| Command | Result |
| --- | --- |
| `pnpm -C apps/sample test` | passed in 31.3s |
| `SAMPLE_BUGS=double-submit pnpm -C apps/sample test:e2e` | passed in 9.5s |
| `pnpm -C apps/sample test:e2e` | passed in 9.3s |
| `pnpm -r typecheck` | passed in 9.6s |
| `pnpm lint` | passed in 3.0s |

## The gates

Review: `APPROVED`

- 13: the reproduction's header comment says why the second test passes before the fix; keep that habit.
- 15: the react skill does not apply (no .tsx touched); simple is judged next.

Simplicity: `SIMPLE — 4 files, +40 −10, 1 new file; 0 helpers, 0 types, 0 dependencies, 0 config changes; longest file touched 135 lines.`

Mechanical findings: none.

## Before merging

Auto-merge is off. A person reads the title, the fix and the verification table, and merges.

Every step of the run, with the agent's messages redacted, is on the Nightshift dashboard under incident `inc-aef82d2a`.
