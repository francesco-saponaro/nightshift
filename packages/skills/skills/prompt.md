# The prompt

Every run gives the coding agent one prompt with three sections, in this order: what to achieve, what it needs to know, and how it will be judged. The runner fills this template from the incident (`apps/agent/src/pipeline/prompt.ts`); the agent reads the filled-in result. The `{{tokens}}` are replaced (`flagNote` and `bugNote` are whole sentences, because an incident can arrive with no flag); everything else is sent as written. Keep the sections in this order, because the agent reads from the top and the first thing it reads shapes what it does with the rest.

Why three sections. A goal without context sends the agent reading the whole repository; context without a goal has it summarising; either without the validation section has it stopping when the code looks right instead of when the proof is in hand. The third section is the one that makes the other two honest: it names the commands whose output decides, so "done" is not a feeling.

---

## Goal

Fix incident `{{incidentId}}` in the sample app, at its cause, with a failing test first.

The error tracker ({{source}}) reported, at {{occurredAt}}:

> {{title}}

It happened on `{{request}}`{{requestBody}}. The release was `{{release}}`. {{flagNote}} Do not switch a flag off, do not catch the error and relabel it, do not add a dependency.

Done means: a test named `{{reproPath}}` that fails on the current code with the flag on, for this reason, and passes after your change; every other test and every verification scenario green, with the flag on and off; a diff that a person reads in a minute.

## Context

The app is `apps/sample`: a Fastify API over a PostgreSQL-shaped store (PGlite) in `src/server/`, a React front in `src/web/`, unit tests in `test/`, Playwright scenarios in `verification/`. Read `apps/sample/src/server/flags.ts` first: it names the three seeded bugs, their symptom and the file each lives in. {{bugNote}}

The stack, as the tracker had it (most recent frame last):

```
{{stack}}
```

Skills to read before you start, in this order, from `.claude/skills/`:

{{skills}}

Rules that are not negotiable: the reproduction runs with `SAMPLE_BUGS={{flag}}`; the fix is at the cause; the diff holds one change; nothing in `package.json`, the lockfile or any config moves; no real user data from the incident goes into a test (use the shape with made-up values).

## Validation and verification scenarios

You are judged on the output of these commands, run by the runner after you stop, in this order. Run them yourself first and include the output of each in your final message.

1. `SAMPLE_BUGS={{flag}} pnpm -C apps/sample exec vitest run {{reproPath}}` on the code before your change: must fail, and the failure must be the incident's error.
2. The same command after your change: must pass.
3. `pnpm -C apps/sample test`: every unit test passes.
4. `SAMPLE_BUGS={{flag}} pnpm -C apps/sample test:e2e`: every scenario passes with the flag on. These scenarios are the proof the fix is a fix:

{{scenarios}}

5. `pnpm -C apps/sample test:e2e`: every scenario passes with the flags off.
6. `pnpm -r typecheck && pnpm lint` at the root.

Then the review gate (`review.md`) and the simplicity gate (`simple.md`) run on your diff. A refusal from either comes back to you once with the findings; a second refusal stops the run and a person takes over.

When you are done, stop. Do not open a pull request, do not commit; the runner does both from your diff and its own logs.
