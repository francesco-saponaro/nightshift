# Keep it simple

A fix that arrives at three in the morning is read by someone who was not there when it was written. It must be the smallest change that makes the reproduction pass and the scenarios green, written so that the person reading the pull request over coffee sees in one minute what changed and why. This file is the measure of "small" and "plain". The runner applies it to the finished diff, after the review.

## The rules

1. **One cause, one change.** The diff fixes the cause the reproduction proves and nothing beside it. If you notice a second problem, write it in the pull request body under "Seen, not touched" and leave the code alone.
2. **No new abstraction for one call site.** A helper, a class, a hook, a generic or a utility file that is called from one place is inlined at that place. Two call sites is the earliest a helper is allowed, and three is when it is usually right.
3. **No cleverness.** No regex where a string method reads better, no reduce where a loop reads better, no ternary chain, no bit trick, no destructuring that hides which field is used. If a line takes a second read, rewrite it or comment it, and prefer rewriting.
4. **No new layer.** No wrapper around the store, the router, the client or the test runner. The code talks to the thing it uses.
5. **The smallest correct type.** No new generic, no conditional type, no `any`, no cast to make the compiler stop. If the type is wrong, fix the type at its source.
6. **Prefer deletion.** A fix that removes a branch (the lenient path a flag enabled) is better than one that adds a branch. When the fix removes a flag's code path, it marks the flag's entry in `flags.ts` with `fixedBy: "<incident id>"`, one line, so the flag is still accepted and the record says which run retired it.
7. **Keep the files where they are.** No file is moved, renamed or split in a fix. A file is not reformatted beyond the lines the fix touches.
8. **Any file over 200 lines is explained.** If a change leaves a file longer than 200 lines, the pull request body says, in one paragraph, what the file is for, why it is that long, and what would be split out of it if it grows again. No file in the sample app is over 200 lines today, so a fix that crosses the line is suspect by that fact alone.
9. **No dependency, no config change, no script change** unless the goal says so. `package.json`, the lockfile, `tsconfig`, the lint config and the workflows are not fixed at three in the morning.
10. **Plain words.** Names, comments, test titles and the pull request body use the words the domain uses: a to-do, a due date, a client key, an incident. Not "entity", "payload", "handler logic", "edge case".

## The measure

Before the pull request, count:

- files changed, lines added, lines removed;
- helpers, types, files and dependencies added.

A fix for one incident is usually one or two source files, one test file, under forty lines added, and nothing added in the second list. A diff well outside that is not wrong by itself, but the pull request body must say why, in one paragraph, before the summary. The runner records both counts on the run so the dashboard can show them.

## Examples

- The 500 on an empty title: the schema in `app.ts` goes back to `strictTitle` and the lenient branch is deleted; the flag entry gets `fixedBy`. Two files, one test, a handful of lines removed and one added.
- The day count: `daysUntil` subtracts from the start of today for every caller, the branch under the flag is deleted. One file, one test.
- The double submit: the insert becomes one statement with `ON CONFLICT ... DO NOTHING RETURNING`, then one select; the check-then-insert branch is deleted. One file, one test. Not: a mutex, a retry, a debounce in the front, a queue.

## The verdict

`SIMPLE` with the counts, or `NOT SIMPLE: <rule number> — <one sentence>`. Like the review, a second refusal stops the run.
