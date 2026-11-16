import { describe, expect, it } from "vitest";
import { demoApi } from "../src/api/demo.js";
import { STEPS, elapsed, stepsOf, verificationOf, type StepSummary } from "../src/timeline.js";
import type { RunEvent } from "../src/api/types.js";

const event = (seq: number, step: string, status: RunEvent["status"], at: string, summary = "", data: Record<string, unknown> = {}): RunEvent => ({ runId: "r", seq, step, status, at, summary, data });

describe("stepsOf", () => {
  it("folds the events into the pipeline's steps, in the pipeline's order, with each step's outcome and time", () => {
    const events = [
      event(1, "received", "info", "2026-11-16T22:00:00.000Z", "sentry: x"),
      event(2, "worktree", "started", "2026-11-16T22:00:01.000Z"),
      event(3, "worktree", "ok", "2026-11-16T22:00:03.500Z", "checked out"),
      event(4, "prompt", "ok", "2026-11-16T22:00:04.000Z", "57 lines"),
      event(5, "reproduce", "started", "2026-11-16T22:00:04.000Z"),
      event(6, "reproduce", "info", "2026-11-16T22:00:05.000Z", "Read"),
      event(7, "reproduce", "failed", "2026-11-16T22:00:09.000Z", "the reproduction did not run to a test failure"),
    ];
    const steps = stepsOf(events);
    expect(steps.map((s) => s.step)).toEqual(STEPS);
    const byStep = Object.fromEntries(steps.map((s) => [s.step, s])) as Record<string, StepSummary>;
    expect(byStep["worktree"]).toMatchObject({ status: "ok", summary: "checked out", durationMs: 2500, events: [events[1], events[2]] });
    expect(byStep["prompt"]).toMatchObject({ status: "ok", durationMs: 0 });
    expect(byStep["reproduce"]).toMatchObject({ status: "failed", summary: "the reproduction did not run to a test failure", durationMs: 5000 });
    expect(byStep["fix"]).toMatchObject({ status: "skipped", events: [] });
    expect(byStep["pr"]).toMatchObject({ status: "skipped" });
  });

  it("marks a step that has started and not finished as running, and a pull request that was not opened as off", () => {
    const running = stepsOf([event(1, "verify", "started", "2026-11-16T22:00:00.000Z", "5 commands")]);
    expect(running.find((s) => s.step === "verify")).toMatchObject({ status: "running", summary: "5 commands" });
    const off = stepsOf([event(1, "pr", "info", "2026-11-16T22:00:00.000Z", "not opened: NIGHTSHIFT_OPEN_PR is not set")]);
    expect(off.find((s) => s.step === "pr")).toMatchObject({ status: "off" });
  });

  it("reads the recorded run as eight ok steps and one pull request left off", async () => {
    const rows = await demoApi.listIncidents();
    const run = await demoApi.getRun(rows[2]!.runs[0]!.id);
    const steps = stepsOf(run!.events);
    expect(steps.map((s) => `${s.step}:${s.status}`)).toEqual(["worktree:ok", "prompt:ok", "reproduce:ok", "fix:ok", "verify:ok", "review:ok", "simple:ok", "pr:off", "done:ok"]);
  });
});

describe("verificationOf", () => {
  it("lists each verification command with its exit code and time, from the run's events", async () => {
    const rows = await demoApi.listIncidents();
    const run = await demoApi.getRun(rows[2]!.runs[0]!.id);
    const commands = verificationOf(run!.events);
    expect(commands.map((c) => c.command)).toEqual(["pnpm -C apps/sample test", "SAMPLE_BUGS=empty-title pnpm -C apps/sample test:e2e", "pnpm -C apps/sample test:e2e", "pnpm -r typecheck", "pnpm lint"]);
    expect(commands.every((c) => c.code === 0 && c.durationMs > 0)).toBe(true);
    expect(commands[0]!.output).toMatch(/25 passed \| 1 skipped/);
  });
});

describe("elapsed", () => {
  it("writes a duration the way a person says it", () => {
    expect(elapsed(0)).toBe("0 s");
    expect(elapsed(2500)).toBe("2.5 s");
    expect(elapsed(28_400)).toBe("28 s");
    expect(elapsed(134_000)).toBe("2 m 14 s");
    expect(elapsed(3_600_000)).toBe("60 m 0 s");
  });
});
