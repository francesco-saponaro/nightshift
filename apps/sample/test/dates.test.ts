import { describe, expect, it } from "vitest";
import { daysUntil, dueLabel } from "../src/server/dates.js";
import { SEEDED_BUGS } from "../src/server/flags.js";

const fixed = (name: string) => Boolean(SEEDED_BUGS.find((b) => b.name === name)?.fixedBy);

const lateEvening = new Date("2026-11-15T22:40:00Z");
const earlyMorning = new Date("2026-11-15T00:20:00Z");

describe("daysUntil", () => {
  it("counts calendar days, whatever the time of day", () => {
    expect(daysUntil("2026-11-16", lateEvening)).toBe(1);
    expect(daysUntil("2026-11-16", earlyMorning)).toBe(1);
    expect(daysUntil("2026-11-15", lateEvening)).toBe(0);
    expect(daysUntil("2026-11-14", earlyMorning)).toBe(-1);
    expect(daysUntil("2026-12-25", lateEvening)).toBe(40);
  });

  it.skipIf(fixed("date-off-by-one"))("with the date-off-by-one bug on, loses a day late in the evening", () => {
    const bugs = new Set(["date-off-by-one"]);
    expect(daysUntil("2026-11-16", lateEvening, bugs)).toBe(0);
    expect(daysUntil("2026-11-15", lateEvening, bugs)).toBe(-1);
    // Early in the day the bug hides, which is why nobody caught it in the office.
    expect(daysUntil("2026-11-16", earlyMorning, bugs)).toBe(1);
  });
});

describe("dueLabel", () => {
  it("says it the way a person would", () => {
    expect(dueLabel(0)).toBe("due today");
    expect(dueLabel(1)).toBe("due tomorrow");
    expect(dueLabel(3)).toBe("due in 3 days");
    expect(dueLabel(-1)).toBe("overdue by 1 day");
    expect(dueLabel(-4)).toBe("overdue by 4 days");
    expect(dueLabel(null)).toBe("no due date");
  });
});
