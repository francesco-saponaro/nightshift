# Nightshift

An on-call engineer that never sleeps. An error arrives from the error tracker (a Sentry or PostHog webhook); Nightshift turns it into a reproduction, hands it to a coding agent in a checkout of its own, requires a failing test before any fix, runs the fix through the app's verification scenarios and two review gates, and opens a pull request. A small dashboard shows every incident from the error to the pull request.

I built it as a reference implementation of a way of working, with a deliberately small app to look after; it is not something to point at a production codebase as it stands. The limits are at the end.

Status: built over two evenings. The first one is done: the sample app with its seeded bugs and verification scenarios, the skills, and the whole pipeline up to the review gates, running end to end in dry-run mode. The second adds the pull request and merge step, the dashboard, CI, the security pass and the live demo.

## What happens when an error comes in

1. The webhook. `POST /webhooks/sentry` or `POST /webhooks/posthog` on `apps/agent`. The signature is checked over the raw bytes with the integration's secret before the body is parsed; a delivery is refused when no secret is configured. The payload is validated with zod and becomes an incident: title, culprit, request, stack, release, and the seeded-bug flag that was on when it happened. The same event delivered twice is one incident.
2. The queue. The incident goes on a pg-boss queue in the same database as everything else (PGlite in memory by default, PGlite on disk or PostgreSQL by `DATABASE_URL`), so a restart loses nothing and two workers never take the same run.
3. A checkout of its own. The worker makes a git worktree on a new branch, installs dependencies there, and puts the skills on the agent's path. The main checkout is never touched.
4. The prompt. Three sections, filled from the incident: Goal, Context, Validation and verification scenarios. The template is `packages/skills/skills/prompt.md`; `fixtures/empty-title/prompt.md` is what the agent got for the recorded incident.
5. A failing reproduction first. The agent is asked for one thing: a unit test named after the incident, with the incident's flag on, and nothing else. The runner runs it and requires it to fail with a real test failure (a crash or a missing file does not count). If it passes, the run stops: there is nothing to fix.
6. The fix. The agent fixes the cause with the smallest diff. The runner runs the reproduction again and requires it to pass.
7. Verification. The sample app's unit tests, the Playwright scenarios with the flag on and with it off, the typecheck and the lint, in that order, in the worktree. One failure stops the run.
8. Two gates. The review skill and the simplicity skill, each in two halves: the lines a program can check on the diff (a reproduction exists, no dependency or config touched, no test weakened, no constraint dropped, no sleep or in-memory state, no secret, no rename, no file over 200 lines, the flag retired) and the lines a reader judges (the agent applies the skill to its own diff and ends with a verdict line). A refusal goes back to the agent once; a second refusal stops the run for a person.
9. The pull request (second evening). Opened from the branch, labelled, with the run's record in the body; merged only when CI is green and the gates passed, and only when auto-merge is switched on, which it is not by default.

Every step leaves an event on the run, in order, redacted of keys, tokens, cookies and addresses. `fixtures/empty-title/events.json` is the full record of one run.

## Dry run and live run

There is no API key in this repository and none is needed to run it. Without `ANTHROPIC_API_KEY`, Nightshift runs in dry-run mode: the agent's turns are replayed from a recorded transcript in `fixtures/` and its edits are applied as patches. Everything else runs for real: the worktree is created, the reproduction runs and has to fail, the fix has to make it pass, the verification scenarios run in a browser, the gates read the diff. The mode is on `/health`, in the log, and on every run.

With `ANTHROPIC_API_KEY` set, the agent is the live one, driven through the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), one session per run, working inside the worktree with the skills loaded as project skills. The key is read by the SDK from the environment and by nothing in this repository; it is never logged, and the transcript is redacted before it is stored.

The fixture in `fixtures/empty-title/` was made without a key. The webhook payload is real: it is what the sample app sent when `SAMPLE_BUGS=empty-title` was on and someone posted an empty title. The prompt is the builder's output. The transcript is authored to match the code paths exactly, and it says so in its first line; the patches are what the agent's edits amount to; the verification log and the events are from a real dry run of the whole pipeline on this machine.

## The sample app

`apps/sample` is the app Nightshift looks after: a to-do list with a Fastify API over a PostgreSQL-shaped store (PGlite), a React front built with Vite, unit tests in `test/` and Playwright scenarios in `verification/`. It ships with three bugs behind flags, so a demo can make it fail for real:

| Flag | What goes wrong | Where |
| --- | --- | --- |
| `empty-title` | An empty title is not refused at the edge; the database constraint rejects it and the API answers 500 instead of 400. | `src/server/app.ts` |
| `date-off-by-one` | Days until a due date are counted from the current time instead of from the start of the day, so after midday a to-do due tomorrow says "due today". | `src/server/dates.ts` |
| `double-submit` | Creating a to-do checks for the client key and then inserts, in two steps; two requests at once both pass the check and the second one fails on the unique index with a 500. | `src/server/store.ts` |

Each flag marks the code path that shipped the bug. The fix a run produces removes that path and marks the flag's entry in `flags.ts` with the incident that retired it, so the flag is still accepted and now does nothing. The tests that document each symptom step aside once the entry is marked, and the reproduction test named after the incident takes over.

Every 500 the app answers goes to a reporter. With `SAMPLE_REPORT_URL` set, the reporter posts a Sentry-shaped event, signed with `SENTRY_CLIENT_SECRET` the way Sentry signs its own, to that URL, so the whole loop runs on one laptop with no Sentry account.

## Run it

```
pnpm install --frozen-lockfile
pnpm test                                      # every package, about 80 seconds; one test is the whole pipeline in dry-run mode
pnpm -C apps/sample test:e2e                   # the verification scenarios, in a browser, bugs off
SAMPLE_BUGS=empty-title pnpm -C apps/sample test:e2e   # the same, with one bug on: its scenario fails
pnpm -C apps/agent run-fixture empty-title     # the pipeline on the recorded incident, with the full verification
pnpm -C apps/agent run-fixture empty-title --quick --keep   # unit tests only, and leave the worktree to look at
```

To run the server and worker:

```
cp .env.example .env            # fill in what you have; nothing is required for the dry run
pnpm -C apps/agent dev          # http://127.0.0.1:4000, webhooks and the read API
pnpm -C apps/sample dev         # http://127.0.0.1:3000, the to-do app
```

Point the sample app at Nightshift with `SAMPLE_REPORT_URL=http://127.0.0.1:4000/webhooks/sentry`, give both the same `SENTRY_CLIENT_SECRET`, switch a bug on with `SAMPLE_BUGS`, use the app, and watch the run in the log. `pnpm test:e2e` needs a Chromium that Playwright can find; `pnpm -C apps/sample exec playwright install chromium` gets one.

## The seven practices and where each one lives

| | Practice | Where |
| --- | --- | --- |
| 1 | Verification skills that teach the agent how to run and test the app | `packages/skills/skills/verify.md`, `apps/sample/verification/` |
| 2 | Agents that write, test and merge without a person reading the diff, with quality enforced by skills | `apps/agent/src/pipeline/run.ts`, `apps/agent/src/pipeline/gates.ts` |
| 3 | Agents in their own environment, one per task | `apps/agent/src/pipeline/worktree.ts` (`NIGHTSHIFT_SANDBOX_URL` for a cloud sandbox, second evening) |
| 4 | The 24/7 on-call engineer wired to Sentry and PostHog | `apps/agent/src/webhooks/`, `apps/agent/src/queue.ts` |
| 5 | Code-quality skills before every pull request | `packages/skills/skills/review.md`, `react.md`, `simple.md` |
| 6 | The three-section prompt | `packages/skills/skills/prompt.md`, `apps/agent/src/pipeline/prompt.ts` |
| 7 | A documented setup | this file, `.env.example`, the second evening's docs |

## Layout

```
apps/sample/        the to-do app: src/server (Fastify, PGlite), src/web (React), test/, verification/
apps/agent/         the runner: webhooks, queue, store, pipeline/, agent/ (recorded and live), cli.ts, main.ts
packages/skills/    the skills as markdown, and a loader
fixtures/           one recorded incident: webhook, prompt, transcript, patches, verification log, events
```

## Known limits

- The transcript in the fixture is authored, not recorded from a live session, because no key was available where it was built. The README will say "recorded" only when it is.
- The review gates' second half is the agent judging its own diff with the skill. In dry-run mode that judgement is the fixture's. A second reviewer session is a natural next step.
- The race in `double-submit` is reachable because the store waits a few milliseconds before each query to behave like a database over a socket; PGlite itself answers inside the same tick.
- No pull request, no dashboard, no CI and no sandbox yet: second evening.
- The human still reads the pull request title. Auto-merge is behind a flag and off by default, and will stay so.
