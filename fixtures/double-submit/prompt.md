## Goal

Fix incident `inc-aef82d2a` in the sample app, at its cause, with a failing test first.

The error tracker (Sentry) reported, at 2026-11-16T20:17:53.310Z:

> duplicate key value violates unique constraint "todos_client_key"

It happened on `POST /api/todos` with the body `{"title":"Book the dentist","dueOn":null,"clientKey":"3f2c9a4e-7d1b-4c8e-9a0f-6b5d4e3c2a1b"}`. The release was `sample@0.1.0`. The app was running with the flag `double-submit` on, which marks the code path that shipped this bug; your fix makes the app correct with that flag on, by removing that path. Do not switch a flag off, do not catch the error and relabel it, do not add a dependency.

Done means: a test named `test/incident-inc-aef82d2a.test.ts` that fails on the current code with the flag on, for this reason, and passes after your change; every other test and every verification scenario green, with the flag on and off; a diff that a person reads in a minute.

## Context

The app is `apps/sample`: a Fastify API over a PostgreSQL-shaped store (PGlite) in `src/server/`, a React front in `src/web/`, unit tests in `test/`, Playwright scenarios in `verification/`. Read `apps/sample/src/server/flags.ts` first: it names the three seeded bugs, their symptom and the file each lives in. For this incident it says:

> Creating a to-do checks for the client key and then inserts, in two steps; two requests with the same key at the same time both pass the check and the second insert fails on the unique index with a 500. (`src/server/store.ts`)

The stack, as the tracker had it (most recent frame last):

```
    at <anonymous> (/app/node_modules/.pnpm/@electric-sql+pglite@0.5.16/node_modules/@electric-sql/pglite/dist/chunk-XZUEO4BZ.js:5:1151)  [library]
    at q.Ce (/app/node_modules/.pnpm/@electric-sql+pglite@0.5.16/node_modules/@electric-sql/pglite/dist/chunk-XZUEO4BZ.js:5:1759)  [library]
    at pe.parse (/app/node_modules/.pnpm/@electric-sql+pglite@0.5.16/node_modules/@electric-sql/pg-protocol/src/parser.ts:104:21)  [library]
    at pe.tt (/app/node_modules/.pnpm/@electric-sql+pglite@0.5.16/node_modules/@electric-sql/pg-protocol/src/parser.ts:220:16)  [library]
    at pe.Oe (/app/node_modules/.pnpm/@electric-sql+pglite@0.5.16/node_modules/@electric-sql/pg-protocol/src/parser.ts:442:11)  [library]
```

Skills to read before you start, in this order, from `.claude/skills/`:

- `verify`: How to run the app, how to write and run a verification scenario, and what done means. Read it: before writing the reproduction, and again before saying the fix is done.
- `react`: How React is written in this codebase: state, effects, forms, data fetching, what not to add. Read it: whenever the change touches a .tsx file.
- `simple`: Keep it simple: no cleverness, no abstraction for one call site, and explain any file over 200 lines. Read it: on the finished diff, before the pull request.
- `review`: The strict code review checklist a change must pass before a pull request opens. Read it: on the finished diff, before the pull request.

Rules that are not negotiable: the reproduction runs with `SAMPLE_BUGS=double-submit`; the fix is at the cause; the diff holds one change; nothing in `package.json`, the lockfile or any config moves; no real user data from the incident goes into a test (use the shape with made-up values).

## Validation and verification scenarios

You are judged on the output of these commands, run by the runner after you stop, in this order. Run them yourself first and include the output of each in your final message.

1. `SAMPLE_BUGS=double-submit pnpm -C apps/sample exec vitest run test/incident-inc-aef82d2a.test.ts` on the code before your change: must fail, and the failure must be the incident's error.
2. The same command after your change: must pass.
3. `pnpm -C apps/sample test`: every unit test passes.
4. `SAMPLE_BUGS=double-submit pnpm -C apps/sample test:e2e`: every scenario passes with the flag on. These scenarios are the proof the fix is a fix:

- `verification/add-a-todo.spec.ts`
- `verification/double-submit.spec.ts`
- `verification/due-dates.spec.ts`

5. `pnpm -C apps/sample test:e2e`: every scenario passes with the flags off.
6. `pnpm -r typecheck && pnpm lint` at the root.

Then the review gate (`review.md`) and the simplicity gate (`simple.md`) run on your diff. A refusal from either comes back to you once with the findings; a second refusal stops the run and a person takes over.

When you are done, stop. Do not open a pull request, do not commit; the runner does both from your diff and its own logs.
