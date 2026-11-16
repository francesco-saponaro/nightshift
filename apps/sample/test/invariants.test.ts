import { describe, expect, it } from "vitest";
import { daysLeftDisagrees } from "../src/web/invariants.js";

const lateEvening = new Date("2026-11-15T22:40:00Z");

describe("daysLeftDisagrees", () => {
  it("is quiet when the server's count matches the calendar, or there is no due date", () => {
    expect(daysLeftDisagrees("2026-11-16", 1, lateEvening)).toBeNull();
    expect(daysLeftDisagrees("2026-11-15", 0, lateEvening)).toBeNull();
    expect(daysLeftDisagrees(null, null, lateEvening)).toBeNull();
  });

  it("says what the server answered and what the calendar says when they differ", () => {
    expect(daysLeftDisagrees("2026-11-16", 0, lateEvening)).toBe("daysLeft for 2026-11-16 is 0 but the calendar says 1 at 2026-11-15T22:40:00.000Z");
  });
});
