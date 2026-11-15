import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildPrompt, reproPath, scenarioList } from "../src/pipeline/prompt.js";
import { parseSentry } from "../src/webhooks/sentry.js";

const fixtures = new URL("../../../fixtures/empty-title/", import.meta.url);

async function incident() {
  return parseSentry(JSON.parse(await readFile(new URL("webhook.json", fixtures), "utf8")));
}

describe("buildPrompt", () => {
  it("fills the three sections from the incident, in order, with no token left", async () => {
    const prompt = await buildPrompt(await incident());
    const goal = prompt.indexOf("## Goal");
    const context = prompt.indexOf("## Context");
    const validation = prompt.indexOf("## Validation and verification scenarios");
    expect(goal).toBeGreaterThanOrEqual(0);
    expect(context).toBeGreaterThan(goal);
    expect(validation).toBeGreaterThan(context);
    expect(prompt).not.toMatch(/\{\{[a-zA-Z.]+\}\}/);
    expect(prompt.startsWith("## Goal")).toBe(true);
  });

  it("names the incident, the flag, the file, the reproduction path and the scenarios", async () => {
    const prompt = await buildPrompt(await incident());
    expect(prompt).toContain("Fix incident `inc-f42f2815`");
    expect(prompt).toContain("`POST /api/todos` with the body `{\"title\":\"\",\"dueOn\":\"2026-11-16\"}`");
    expect(prompt).toContain("the flag `empty-title` on");
    expect(prompt).toContain("`src/server/app.ts`");
    expect(prompt).toContain("An empty or blank title is not refused at the edge");
    expect(prompt).toContain("`test/incident-inc-f42f2815.test.ts`");
    expect(prompt).toContain("SAMPLE_BUGS=empty-title pnpm -C apps/sample test:e2e");
    expect(prompt).toContain("- `verification/add-a-todo.spec.ts`");
    expect(prompt).toContain("- `verify`:");
    expect(prompt).toContain("at pe.Oe (");
  });

  it("says when there is no flag and no body, instead of printing nothing", async () => {
    const base = await incident();
    const prompt = await buildPrompt({ ...base, flag: null, request: { method: "GET", url: "/api/todos" } });
    expect(prompt).toContain("No seeded-bug flag was reported");
    expect(prompt).toContain("`GET /api/todos`.");
    expect(prompt).toContain("SAMPLE_BUGS= pnpm");
  });

  it("matches the recorded prompt of the fixture run, word for word", async () => {
    const prompt = await buildPrompt(await incident());
    const recorded = await readFile(new URL("prompt.md", fixtures), "utf8");
    expect(prompt).toBe(recorded);
  });
});

describe("reproPath and scenarioList", () => {
  it("name the reproduction after the incident and list the scenarios from disk", async () => {
    expect(reproPath("inc-f42f2815")).toBe("test/incident-inc-f42f2815.test.ts");
    const scenarios = await scenarioList();
    expect(scenarios).toEqual(["verification/add-a-todo.spec.ts", "verification/double-submit.spec.ts", "verification/due-dates.spec.ts"]);
  });
});
