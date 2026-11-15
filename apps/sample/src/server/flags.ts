/**
 * The three bugs this app ships with, each behind a flag.
 *
 * They are here so a demo can make the app fail for real: switch one on with SAMPLE_BUGS, use the app, and the error
 * tracker gets a genuine incident for Nightshift to fix. The flag marks the code path that shipped the bug. The fix a
 * run produces removes that path and marks the entry below `fixedBy` with the incident, so the flag is still accepted
 * (nothing that sets it breaks) and does nothing. It does not "turn the flag off".
 */
export interface SeededBug {
  name: string;
  symptom: string;
  file: string;
  trigger: string;
  /** The incident whose fix removed the code path, once there is one. */
  fixedBy?: string;
}

export const SEEDED_BUGS: readonly SeededBug[] = [
  {
    name: "empty-title",
    symptom: "An empty or blank title is not refused at the edge; the database check constraint rejects the row and the API answers 500 instead of 400.",
    file: "src/server/app.ts",
    trigger: "POST /api/todos with { title: \"\" }",
  },
  {
    name: "date-off-by-one",
    symptom: "The days left until a due date are counted from the current time instead of from the start of the day, so after midday a to-do due tomorrow says it is due today, and one due today says it is overdue.",
    file: "src/server/dates.ts",
    trigger: "POST /api/todos with a dueOn of tomorrow, after 12:00 UTC",
  },
  {
    name: "double-submit",
    symptom: "Creating a to-do checks for the client key and then inserts, in two steps; two requests with the same key at the same time both pass the check and the second insert fails on the unique index with a 500.",
    file: "src/server/store.ts",
    trigger: "Two POST /api/todos with the same clientKey at once (a double click on Add)",
  },
];

export function parseBugs(value: string | undefined, known: readonly SeededBug[] = SEEDED_BUGS): Set<string> {
  const names = new Set(known.map((b) => b.name));
  const bugs = new Set<string>();
  for (const part of (value ?? "").split(",")) {
    const name = part.trim();
    if (!name) continue;
    if (!names.has(name)) {
      throw new Error(`Unknown seeded bug "${name}". Known: ${[...names].join(", ")}`);
    }
    bugs.add(name);
  }
  return bugs;
}
