import { parsePostHog } from "@agent/webhooks/posthog.js";
import { parseSentry } from "@agent/webhooks/sentry.js";
import dateEvents from "@fixtures/date-off-by-one/events.json";
import dateWebhook from "@fixtures/date-off-by-one/webhook.json";
import doubleEvents from "@fixtures/double-submit/events.json";
import doubleWebhook from "@fixtures/double-submit/webhook.json";
import emptyEvents from "@fixtures/empty-title/events.json";
import emptyWebhook from "@fixtures/empty-title/webhook.json";
import promptMd from "@skills/prompt.md?raw";
import reactMd from "@skills/react.md?raw";
import reviewMd from "@skills/review.md?raw";
import simpleMd from "@skills/simple.md?raw";
import verifyMd from "@skills/verify.md?raw";
import type { DashboardApi, IncidentWithRuns, RunEvent, RunRow, RunWithEvents, SkillDoc } from "./types.js";

/**
 * The demo: the three recorded runs in fixtures/, read the way the server would answer. The incident is parsed from the
 * webhook with the same parsers the server uses; the run is rebuilt from its events (the first says when it started and
 * the last what it ended as). Nothing here is live, and the health answer says so.
 */
const FIXTURES: { webhook: unknown; events: RunEvent[] }[] = [
  { webhook: emptyWebhook, events: emptyEvents as RunEvent[] },
  { webhook: dateWebhook, events: dateEvents as RunEvent[] },
  { webhook: doubleWebhook, events: doubleEvents as RunEvent[] },
];

// The same five entries the loader in packages/skills carries; the browser cannot read that package's files.
const SKILLS: Omit<SkillDoc, "body">[] = [
  { name: "verify", file: "verify.md", purpose: "How to run the app, how to write and run a verification scenario, and what done means.", when: "Before writing the reproduction, and again before saying the fix is done.", gate: false },
  { name: "review", file: "review.md", purpose: "The strict code review checklist a change must pass before a pull request opens.", when: "On the finished diff, before the pull request.", gate: true },
  { name: "react", file: "react.md", purpose: "How React is written in this codebase: state, effects, forms, data fetching, what not to add.", when: "Whenever the change touches a .tsx file.", gate: true },
  { name: "simple", file: "simple.md", purpose: "Keep it simple: no cleverness, no abstraction for one call site, and explain any file over 200 lines.", when: "On the finished diff, before the pull request.", gate: true },
  { name: "prompt", file: "prompt.md", purpose: "The three-section prompt template: Goal, Context, Validation and verification scenarios.", when: "The runner fills it in for every incident; the agent reads the result, not the template.", gate: false },
];
const BODIES: Record<string, string> = { verify: verifyMd, review: reviewMd, react: reactMd, simple: simpleMd, prompt: promptMd };

function runOf(events: RunEvent[], incidentId: string): RunRow {
  const first = events[0]!;
  const last = events.at(-1)!;
  const done = last.step === "done" && last.status === "ok";
  const failed = events.find((e) => e.status === "failed" && e.step !== "verify" && e.step !== "reproduce") ?? events.find((e) => e.status === "failed");
  const worktree = events.find((e) => e.step === "worktree");
  return {
    id: first.runId,
    incidentId,
    mode: (first.data["mode"] as RunRow["mode"]) ?? "dry-run",
    status: done ? "fixed" : failed ? "failed" : "running",
    step: done ? "done" : last.step,
    startedAt: first.at,
    finishedAt: done || failed ? last.at : null,
    worktree: (worktree?.data["dir"] as string | undefined) ?? null,
    branch: (last.data["branch"] as string | undefined) ?? null,
    summary: done ? last.data : failed ? { failedStep: failed.step, reason: failed.summary } : {},
  };
}

const rows: IncidentWithRuns[] = FIXTURES.map(({ webhook, events }) => {
  const incident = (webhook as { action?: string }).action ? parseSentry(webhook) : parsePostHog(webhook);
  // The recorded runs were made after the fact; the incident was received when the tracker reported it.
  return { incident, receivedAt: incident.occurredAt, runs: [runOf(events, incident.id)] };
}).sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));

const runs = new Map<string, RunWithEvents>(FIXTURES.map(({ events }, i) => [events[0]!.runId, { run: rows.find((r) => r.runs[0]!.id === events[0]!.runId)?.runs[0] ?? runOf(events, String(i)), events }]));

export const demoApi: DashboardApi = {
  async listIncidents() {
    return rows;
  },
  async getIncident(id) {
    return rows.find((r) => r.incident.id === id) ?? null;
  },
  async getRun(id) {
    return runs.get(id) ?? null;
  },
  async health() {
    return { ok: true, mode: "dry-run", integrations: { sentry: false, posthog: false, agent: false, sandbox: false }, pullRequests: null, demo: true };
  },
  async skills() {
    return { skills: SKILLS.map((s) => ({ ...s, body: BODIES[s.name] ?? "" })) };
  },
};
