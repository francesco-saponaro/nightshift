# Changelog

## 2026-11-16 — second evening

- The pull request step (`apps/agent/src/pipeline/pr.ts`): the branch is committed with the agent's edits only, pushed, and opened with `gh` under the `nightshift` label, with a body written from the run's own events (the incident, the reproduction's failing output, the files, every verification command with its time, both verdicts, "Seen, not touched"). Off unless `NIGHTSHIFT_OPEN_PR=1`; auto-merge only with `NIGHTSHIFT_AUTO_MERGE=1` as well. Without it the run records the title and body it would have used.
- Two more recorded incidents: `date-off-by-one` (reported by the sample's web client through PostHog's `$exception` shape, captured in a real browser) and `double-submit` (from the reporter, Sentry's shape). Every fixture now carries `pr.md`.
- The sample's web client checks the server's day count against the calendar and hands a disagreement to the error tracker's browser SDK when one is loaded. The symptom tests that called the buggy functions directly moved behind the app, so they still compile once a fix removes the branch and its argument.
- The read API answers any origin on GET, serves the skills at `/skills`, and `/health` says how pull requests are opened.

## 2026-11-15 — first evening

- The sample to-do app (`apps/sample`): Fastify API over PGlite, React front, three seeded bugs behind `SAMPLE_BUGS` (`empty-title`, `date-off-by-one`, `double-submit`), a Sentry-shaped error reporter, 27 unit tests, six Playwright verification scenarios.
- The skills (`packages/skills`): `verify.md`, `review.md`, `react.md`, `simple.md` and the three-section `prompt.md`, with a loader.
- The runner (`apps/agent`): Sentry and PostHog webhooks with HMAC checks over the raw body, incidents and runs in PGlite or PostgreSQL, a pg-boss queue on the same database, a worktree per run, the prompt builder, the reproduction step that requires a failing test, the fix step, the verification step, the review and simplicity gates (mechanical checks plus the agent's verdict), a recorded agent for dry runs and the live agent on the Claude Agent SDK, a command line to run a fixture, and the read API the dashboard will use.
- One fixture (`fixtures/empty-title`): a real webhook from the sample app, the prompt, an authored transcript, the reproduction and fix patches, the verification log and the events of a full dry run.
