import { describe, expect, it } from "vitest";
import { SEEDED_BUGS, parseBugs } from "../src/server/flags.js";

describe("the seeded bugs", () => {
  it("are three, each with a name, a symptom and where it lives", () => {
    expect(SEEDED_BUGS.map((b) => b.name)).toEqual(["empty-title", "date-off-by-one", "double-submit"]);
    for (const bug of SEEDED_BUGS) {
      expect(bug.symptom.length).toBeGreaterThan(20);
      expect(bug.file).toMatch(/^src\/server\//);
    }
  });

  it("accepts a bug's name after a run has retired it, so nothing that sets the flag breaks", () => {
    const retired = SEEDED_BUGS.map((b) => ({ ...b, fixedBy: "inc-00000000" }));
    expect(parseBugs(retired.map((b) => b.name).join(","), retired)).toEqual(new Set(SEEDED_BUGS.map((b) => b.name)));
  });

  it("parses a comma-separated list, ignoring spaces and empties", () => {
    expect(parseBugs("empty-title, double-submit,,")).toEqual(new Set(["empty-title", "double-submit"]));
    expect(parseBugs(undefined)).toEqual(new Set());
    expect(parseBugs("")).toEqual(new Set());
  });

  it("refuses a name it does not know, so a typo cannot silently switch nothing on", () => {
    expect(() => parseBugs("empty-titel")).toThrow(/empty-titel/);
  });
});
