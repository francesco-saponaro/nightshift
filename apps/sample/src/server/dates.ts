const DAY = 24 * 60 * 60 * 1000;

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole calendar days from today to the due date: 0 is today, 1 is tomorrow, -1 was yesterday. */
export function daysUntil(dueOn: string, now: Date, bugs: ReadonlySet<string> = new Set()): number {
  const due = Date.parse(`${dueOn}T00:00:00Z`);
  if (bugs.has("date-off-by-one")) {
    // Counts from "now" instead of from the start of today, so after midday the rounding drops a day.
    return Math.round((due - now.getTime()) / DAY);
  }
  return Math.round((due - utcMidnight(now)) / DAY);
}

export function dueLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "no due date";
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  if (daysLeft > 1) return `due in ${daysLeft} days`;
  const late = -daysLeft;
  return `overdue by ${late} ${late === 1 ? "day" : "days"}`;
}
