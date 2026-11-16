import { describe, expect, it } from "vitest";
import { demoApi } from "../src/api/demo.js";

describe("the demo data, built from the recorded runs", () => {
  it("lists the three recorded incidents, newest first, each with its one fixed run", async () => {
    const rows = await demoApi.listIncidents();
    expect(rows.map((r) => r.incident.id)).toEqual(["inc-ec6c6789", "inc-aef82d2a", "inc-f42f2815"]);
    for (const row of rows) {
      expect(row.runs).toHaveLength(1);
      expect(row.runs[0]).toMatchObject({ incidentId: row.incident.id, status: "fixed", mode: "dry-run", step: "done" });
      expect(row.receivedAt <= row.runs[0]!.startedAt).toBe(true);
    }
    expect(rows[0]!.incident).toMatchObject({ source: "posthog", flag: "date-off-by-one", culprit: "POST /api/todos" });
  });

  it("answers one incident with its run, and a run with its events in order", async () => {
    const row = await demoApi.getIncident("inc-f42f2815");
    expect(row?.incident.title).toMatch(/todos_title_not_blank/);
    const run = await demoApi.getRun(row!.runs[0]!.id);
    expect(run?.run.summary).toMatchObject({ counts: { files: 3, added: 34, removed: 10 }, branch: "nightshift/inc-f42f2815", pullRequest: { url: null } });
    expect(run?.events.map((e) => e.seq)).toEqual(run?.events.map((_, i) => i + 1));
    expect(run?.events.at(-1)).toMatchObject({ step: "done", status: "ok" });
    expect(await demoApi.getIncident("inc-00000000")).toBeNull();
    expect(await demoApi.getRun("nope")).toBeNull();
  });

  it("says it is the demo: dry-run mode, nothing configured, pull requests off", async () => {
    expect(await demoApi.health()).toEqual({ ok: true, mode: "dry-run", integrations: { sentry: false, posthog: false, agent: false, sandbox: false }, pullRequests: null, demo: true });
  });

  it("serves the five skills with their markdown", async () => {
    const { skills } = await demoApi.skills();
    expect(skills.map((s) => s.name)).toEqual(["verify", "review", "react", "simple", "prompt"]);
    expect(skills.find((s) => s.name === "review")).toMatchObject({ gate: true, file: "review.md" });
    expect(skills.find((s) => s.name === "simple")?.body).toContain("# Keep it simple");
  });
});
