# Changelog

## 2026-11-15 — first evening

- The sample to-do app (`apps/sample`): Fastify API over PGlite, React front, three seeded bugs behind `SAMPLE_BUGS` (`empty-title`, `date-off-by-one`, `double-submit`), a Sentry-shaped error reporter, 27 unit tests, six Playwright verification scenarios.
- The skills (`packages/skills`): `verify.md`, `review.md`, `react.md`, `simple.md` and the three-section `prompt.md`, with a loader.
- The runner (`apps/agent`): Sentry and PostHog webhooks with HMAC checks over the raw body, incidents and runs in PGlite or PostgreSQL, a pg-boss queue on the same database, a worktree per run, the prompt builder, the reproduction step that requires a failing test, the fix step, the verification step, the review and simplicity gates (mechanical checks plus the agent's verdict), a recorded agent for dry runs and the live agent on the Claude Agent SDK, a command line to run a fixture, and the read API the dashboard will use.
- One fixture (`fixtures/empty-title`): a real webhook from the sample app, the prompt, an authored transcript, the reproduction and fix patches, the verification log and the events of a full dry run.
