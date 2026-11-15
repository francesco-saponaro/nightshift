# Verification scenarios

Each file here is one scenario a person would run by hand to check the app does its job: a to-do can be added, a due date reads the way a person would say it, a double click adds one to-do and not two. They run with Playwright against the built app (`pnpm test:e2e`), on port 3900, with the seeded bugs that `SAMPLE_BUGS` names switched on.

A scenario is also the proof a fix asks for. To show a bug, run the scenarios with that bug on and watch one fail. To show the fix, run them again on the fixed code with the same flag and watch it pass. `packages/skills/skills/verify.md` says how to write a new one.
