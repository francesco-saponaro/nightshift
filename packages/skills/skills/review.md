# Review

The code review a change must pass before a pull request opens. The runner applies it to the finished diff; the agent applies it to itself first. A review is not an opinion about style. It is a list of questions with yes or no answers, and one "no" on a blocking question is a refusal. The reviewer reads the diff, the tests it touches, and the files it changes in full, not the diff alone, because a change is wrong in the context it lands in, not in isolation.

## How to review

Read the goal first, then the diff, then every file the diff touches from the top. Run the tests yourself; do not trust a transcript that says they passed. Write down, for every hunk, what it changes and why it is needed for the goal. A hunk you cannot tie to the goal is a finding. Then go through the checklist in order and answer each line with yes, no, or not applicable, with the file and line that made you answer.

## The checklist

Blocking. Any "no" refuses the change.

1. **The reproduction exists and failed first.** There is a test named after the incident, it sets the flag the incident names, and the run shows it failing before the fix and passing after. A fix without a failing test first is a guess.
2. **The fix is at the cause, not at the symptom.** A 500 on an empty title is fixed where the title is validated, not by catching the exception and answering 400. A wrong day count is fixed in the function that counts, not in the label. A race is fixed by making the operation atomic, not by retrying it.
3. **Nothing the goal did not ask for.** No renamed symbols, no moved files, no reformatting of untouched lines, no new helper used once, no "while I was here". If the diff touches a file the goal does not mention, the hunk explains itself or it goes.
4. **No dependency added.** The fix uses what the repository already has. A new package is a decision for a person.
5. **No test weakened.** No assertion removed or loosened, no `skip`, no `only`, no timeout raised to make a race disappear, no snapshot updated without a reason in the diff.
6. **Errors still reach the tracker.** The error handler, the reporter and the logging are untouched, or the goal said to change them. A fix that hides the error is worse than the bug.
7. **Input is validated at the edge.** Anything from a request body, query or header goes through the schema before it is used, and the schema is strict: unknown keys refused, lengths bounded, dates checked to be dates.
8. **The database stays the last line of defence.** Constraints are not dropped to make an insert succeed. A unique index that fires under a race means the code above it is wrong, not the index.
9. **Concurrency is handled with the database, not with memory.** No in-process locks, no "seen" sets, no sleep. Two instances of the API must behave the same as one.
10. **Secrets and personal data.** No key, token or password in code, tests, fixtures or logs. The reproduction does not paste a real user's data from the incident; it uses the shape with made-up values.
11. **Every scenario and test passes**, with the flag on and off, and the output is in the run. "Should pass" is a no.

Advisory. A "no" is written up in the pull request and does not refuse the change.

12. **Names say what the thing is.** A function is a verb phrase, a boolean reads as a question, a constant is in capitals only when it is one.
13. **Comments say why, not what.** A comment that repeats the line below it goes; a comment that explains a non-obvious choice stays.
14. **The error message helps the next person.** A 400 names the field and what was wrong with it; a thrown error names the operation.
15. **The React skill and the simple skill** have been applied if the change touches a `.tsx` file or adds more than twenty lines anywhere.

## The verdict

The review ends with one of two lines, and nothing softer:

- `APPROVED` — every blocking line is yes or not applicable, with the evidence listed; advisory findings, if any, are listed under it.
- `REFUSED: <the number of the first blocking line that is no> — <one sentence on what was seen>`.

A refused review goes back to the agent once, with the findings. If the second diff is refused, the run stops and a person reads it. There is no third attempt, because a change that needs three tries is a change a person should think about.

## Worked example

Goal: "POST /api/todos answers 500 on an empty title; it must answer 400 naming the title". A diff arrives that wraps `store.insert` in `try/catch` and answers 400 when the message mentions `todos_title_not_blank`. Line 2 is no: the symptom is handled, the cause (the title is not validated before the insert) is untouched, and the next blank-ish value the constraint catches will be a 500 again. `REFUSED: 2 — the 500 is caught and relabelled; the title still reaches the database unvalidated.` The right diff tightens the schema in `app.ts` and deletes the lenient branch.
