# Verify

How to run the app you are fixing, how to prove a bug with a scenario, and what "done" means here. Read this before you write the reproduction and again before you say the fix is finished. Nothing in this file is advice; it is the bar.

## Run the app

The app is a small to-do list: a Fastify API over a PostgreSQL-shaped store (PGlite), a React front built with Vite. It lives in `apps/sample`. From the repository root:

```
pnpm install --frozen-lockfile        # once per checkout
pnpm -C apps/sample test              # the unit tests, about ten seconds
pnpm -C apps/sample build             # the API to dist/server, the front to dist/web
pnpm -C apps/sample start             # http://127.0.0.1:3000
```

`SAMPLE_BUGS` switches the seeded bugs on: `SAMPLE_BUGS=empty-title pnpm -C apps/sample start`. The incident you are working on names the flag that was on when the error happened, under `sample.bugs` in its tags. Your reproduction runs with that flag on. Your fix makes the app correct with the flag on, because the flag marks the code path that shipped; the fix removes that path and marks the flag's entry in `flags.ts` with `fixedBy: "<incident id>"`, so the flag is still accepted and now does nothing. It does not switch the flag off. A pull request that only edits `SAMPLE_BUGS` or the flag check is refused.

The API, for a reproduction at the HTTP level:

| Method and path | Body | Answers |
| --- | --- | --- |
| `GET /health` | | `{ ok, bugs }` |
| `GET /api/todos` | | `{ todos: Todo[] }` |
| `POST /api/todos` | `{ title, dueOn?, clientKey? }` | 201 with the to-do, 200 when the client key was seen before, 400 on a bad body |
| `PATCH /api/todos/:id` | `{ title?, dueOn?, done? }` | 200 with the to-do, 404 |
| `DELETE /api/todos/:id` | | 204, 404 |

A `Todo` is `{ id, title, dueOn, done, daysLeft, createdAt }`. `daysLeft` counts calendar days from today: 0 is today, 1 is tomorrow, negative is overdue. Every 500 goes to the error tracker with the request's method, path and body.

## Write a scenario

A scenario is a Playwright test in `apps/sample/verification/`, one file per thing a person would check by hand. It drives the built app through the browser, the way a user does, and it asserts what the user would see. It does not reach into the store, mock the API, or read the server's logs. Rules:

1. One scenario proves one claim, named in the test title in plain words: "a to-do due tomorrow says so, whatever the time of day". If the title needs "and", split it.
2. Use the labels a user sees (`getByLabel("Title")`, `getByRole("button", { name: "Add" })`), never CSS classes or test ids. If the thing has no label, the UI is wrong, not the test.
3. Assert the outcome, not the mechanism: the to-do is in the list with the right words next to it; the alert says what was wrong; there is one to-do after a double click, not two. Never assert on a 500 having been avoided by checking for the absence of a message that may not have arrived yet; wait for the answers themselves (see `double-submit.spec.ts`).
4. Dates come from the clock, never hard-coded; `helpers.ts` has `daysFromToday(n)`.
5. A scenario that passes with the bug switched on is not a reproduction. Run it both ways before you trust it.

A unit test for the reproduction goes in `apps/sample/test/` and follows the same idea at the API level, with `buildApp({ bugs, now })` and `app.inject`. It must set the flag the incident names. Its name starts with the incident's id, so the run can find it: `test/incident-<id>.test.ts`.

## Run the scenarios

```
pnpm -C apps/sample test:e2e                          # bugs off: the app as it should be
SAMPLE_BUGS=empty-title pnpm -C apps/sample test:e2e  # one bug on: its scenario must fail
```

The runner starts the built app on port 3900 and stops it afterwards. On a failure the trace is in `apps/sample/test-results/`; read the error context file before you change anything. A scenario that is flaky is a bug in the scenario; fix it or delete it, never retry it.

## What done means

The fix is done when every line below is true and you have the output that proves it, in this order:

1. The reproduction test failed before your change, with the incident's flag on, for the reason the incident describes. If it failed for another reason, it is not a reproduction.
2. The reproduction test passes after your change, with the same flag on.
3. `pnpm -C apps/sample test` passes: every unit test, not only yours.
4. `SAMPLE_BUGS=<the flag> pnpm -C apps/sample test:e2e` passes: every scenario, with the flag on.
5. `pnpm -C apps/sample test:e2e` passes with the flags off, so the fix broke nothing for everyone else.
6. `pnpm -r typecheck` and `pnpm lint` pass at the root.
7. The diff is what the goal asked for and nothing else: no renamed files, no reformatting of lines you did not change, no new dependency, no deleted test. If you removed a flag's code path, you removed the dead branch and added `fixedBy` to its entry in `flags.ts`, and nothing more.

"It should work" is not a line in that list. If a step cannot run, say so, show what you tried, and stop; a run that stops honestly is handled by a person, a run that claims success without the output is not.
