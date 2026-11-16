## Goal

Fix incident `inc-ec6c6789` in the sample app, at its cause, with a failing test first.

The error tracker (PostHog) reported, at 2026-11-16T20:21:49.259Z:

> daysLeft for 2026-11-17 is 0 but the calendar says 1 at 2026-11-16T20:21:49.245Z

It happened on `POST /api/todos`. The release was `sample@0.1.0`. The app was running with the flag `date-off-by-one` on, which marks the code path that shipped this bug; your fix makes the app correct with that flag on, by removing that path. Do not switch a flag off, do not catch the error and relabel it, do not add a dependency.

Done means: a test named `test/incident-inc-ec6c6789.test.ts` that fails on the current code with the flag on, for this reason, and passes after your change; every other test and every verification scenario green, with the flag on and off; a diff that a person reads in a minute.

## Context

The app is `apps/sample`: a Fastify API over a PostgreSQL-shaped store (PGlite) in `src/server/`, a React front in `src/web/`, unit tests in `test/`, Playwright scenarios in `verification/`. Read `apps/sample/src/server/flags.ts` first: it names the three seeded bugs, their symptom and the file each lives in. For this incident it says:

> The days left until a due date are counted from the current time instead of from the start of the day, so after midday a to-do due tomorrow says it is due today, and one due today says it is overdue. (`src/server/dates.ts`)

The stack, as the tracker had it (most recent frame last):

```
    at c (/assets/index-Dtx7lnFQ.js:9:52783)
```

Skills to read before you start, in this order, from `.claude/skills/`:

- `verify`: How to run the app, how to write and run a verification scenario, and what done means. Read it: before writing the reproduction, and again before saying the fix is done.
- `react`: How React is written in this codebase: state, effects, forms, data fetching, what not to add. Read it: whenever the change touches a .tsx file.
- `simple`: Keep it simple: no cleverness, no abstraction for one call site, and explain any file over 200 lines. Read it: on the finished diff, before the pull request.
- `review`: The strict code review checklist a change must pass before a pull request opens. Read it: on the finished diff, before the pull request.

Rules that are not negotiable: the reproduction runs with `SAMPLE_BUGS=date-off-by-one`; the fix is at the cause; the diff holds one change; nothing in `package.json`, the lockfile or any config moves; no real user data from the incident goes into a test (use the shape with made-up values).

## Validation and verification scenarios

You are judged on the output of these commands, run by the runner after you stop, in this order. Run them yourself first and include the output of each in your final message.

1. `SAMPLE_BUGS=date-off-by-one pnpm -C apps/sample exec vitest run test/incident-inc-ec6c6789.test.ts` on the code before your change: must fail, and the failure must be the incident's error.
2. The same command after your change: must pass.
3. `pnpm -C apps/sample test`: every unit test passes.
4. `SAMPLE_BUGS=date-off-by-one pnpm -C apps/sample test:e2e`: every scenario passes with the flag on. These scenarios are the proof the fix is a fix:

- `verification/add-a-todo.spec.ts`
- `verification/double-submit.spec.ts`
- `verification/due-dates.spec.ts`

5. `pnpm -C apps/sample test:e2e`: every scenario passes with the flags off.
6. `pnpm -r typecheck && pnpm lint` at the root.

Then the review gate (`review.md`) and the simplicity gate (`simple.md`) run on your diff. A refusal from either comes back to you once with the findings; a second refusal stops the run and a person takes over.

When you are done, stop. Do not open a pull request, do not commit; the runner does both from your diff and its own logs.
