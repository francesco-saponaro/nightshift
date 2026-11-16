# Fixtures

One folder per recorded incident. Each holds what one run of the pipeline needs and produces:

| File | What it is | Where it came from |
| --- | --- | --- |
| `webhook.json` | The delivery from the error tracker, as received. | Captured with the bug's flag on: from the sample app's reporter (Sentry's shape) or from its web client in a real browser (PostHog's `$exception` shape). Machine paths shortened to `/app/`. |
| `prompt.md` | The three-section prompt the agent was given. | The prompt builder's output; a test checks it still is. |
| `transcript.json` | The agent's turns, phase by phase, with its final message for each. | Authored to match the code paths exactly when no key was available; `recorded` says which. |
| `reproduce.patch`, `fix.patch` | What the agent's edits amount to, as unified diffs relative to the project root. | Applied by the recorded agent in a dry run. |
| `verification.log` | The verification step's commands and their output. | A real dry run of the whole pipeline. |
| `events.json` | Every event of that run, in order, redacted. | The same dry run, via `run-fixture <name> --out`. |
| `pr.md` | The pull request title and body the run wrote from its own events. | The same dry run; with `NIGHTSHIFT_OPEN_PR=1` this is what `gh pr create` is given. |

In a dry run (no `ANTHROPIC_API_KEY`) the runner replays `transcript.json` and applies the patches; everything after that happens for real against the checkout. To record a new fixture, run the pipeline with a key and `--out fixtures/<name>`, then copy the agent's edits into the two patches and its messages into the transcript.

| Fixture | Incident | Flag | Source |
| --- | --- | --- | --- |
| `empty-title` | `inc-f42f2815`: a blank title answered 500 from the database's check constraint. | `empty-title` | Sentry, from the reporter |
| `date-off-by-one` | `inc-ec6c6789`: a to-do due tomorrow came back with `daysLeft` 0 at 20:21 UTC; the browser's own calendar check reported it. | `date-off-by-one` | PostHog, from the web client |
| `double-submit` | `inc-aef82d2a`: two requests with the same client key at once; the second answered 500 from the unique index. | `double-submit` | Sentry, from the reporter |
