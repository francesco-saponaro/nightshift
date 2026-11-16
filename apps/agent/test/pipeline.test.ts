import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chooseAgent } from "../src/agent/select.js";
import { migrate, openDb, type Db } from "../src/db.js";
import type { PullRequestInput } from "../src/pipeline/pr.js";
import { runIncident, type RunOutcome } from "../src/pipeline/run.js";
import { findRepo } from "../src/pipeline/worktree.js";
import { makeStore, type Store } from "../src/store.js";
import { parsePostHog } from "../src/webhooks/posthog.js";
import { parseSentry } from "../src/webhooks/sentry.js";

/**
 * Each fixture, end to end, in dry-run mode: a real worktree of this repository at HEAD, a real install, the recorded
 * agent's patches applied, the reproduction run and required to fail, the fix applied and the reproduction required
 * to pass, the sample app's unit tests, the two gates on the real diff, the pull request written. Only the agent is
 * replayed, and git and gh are stood in for on the one run that opens a pull request, so nothing leaves this machine.
 */
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const fixturesDir = join(projectRoot, "fixtures");

interface Expected {
  incidentId: string;
  flag: string;
  counts: { files: number; added: number; removed: number; newFiles: number };
  files: string[];
  failure: RegExp;
  reproPasses: RegExp;
  unitTests: RegExp;
  simpleVerdict: RegExp;
}

const FIXTURES: Record<string, Expected> = {
  "empty-title": {
    incidentId: "inc-f42f2815",
    flag: "empty-title",
    counts: { files: 3, added: 34, removed: 10, newFiles: 1 },
    files: ["sample/src/server/app.ts", "sample/src/server/flags.ts", "sample/test/incident-inc-f42f2815.test.ts"],
    failure: /expected 500 to be 400/,
    reproPasses: /2 passed/,
    unitTests: /25 passed \| 1 skipped/,
    simpleVerdict: /^SIMPLE — 3 files, \+34 −10/m,
  },
  "date-off-by-one": {
    incidentId: "inc-ec6c6789",
    flag: "date-off-by-one",
    counts: { files: 4, added: 31, removed: 6, newFiles: 1 },
    files: ["sample/src/server/app.ts", "sample/src/server/dates.ts", "sample/src/server/flags.ts", "sample/test/incident-inc-ec6c6789.test.ts"],
    failure: /expected \+0 to be 1/,
    reproPasses: /2 passed/,
    unitTests: /25 passed \| 1 skipped/,
    simpleVerdict: /^SIMPLE — 4 files, \+31 −6/m,
  },
  "double-submit": {
    incidentId: "inc-aef82d2a",
    flag: "double-submit",
    counts: { files: 4, added: 40, removed: 10, newFiles: 1 },
    files: ["sample/src/server/app.ts", "sample/src/server/flags.ts", "sample/src/server/store.ts", "sample/test/incident-inc-aef82d2a.test.ts"],
    failure: /expected \[ 201, 500 \] to deeply equal \[ 200, 201 \]/,
    reproPasses: /2 passed/,
    unitTests: /25 passed \| 1 skipped/,
    simpleVerdict: /^SIMPLE — 4 files, \+40 −10/m,
  },
};

let db: Db;
let store: Store;
let worktreesDir: string;

beforeAll(async () => {
  db = await openDb();
  await migrate(db);
  store = makeStore(db);
  worktreesDir = await mkdtemp(join(tmpdir(), "nightshift-runs-"));
});
afterAll(async () => {
  await db.close();
  await rm(worktreesDir, { recursive: true, force: true });
});

async function runFixture(name: string, withPullRequest: boolean): Promise<{ outcome: RunOutcome; opened: PullRequestInput[] }> {
  const fixtureDir = join(fixturesDir, name);
  const payload: unknown = JSON.parse(await readFile(join(fixtureDir, "webhook.json"), "utf8"));
  const incident = (payload as { action?: string }).action ? parseSentry(payload) : parsePostHog(payload);
  await store.saveIncident(incident, {});
  const { agent, mode } = await chooseAgent({ env: {}, fixtureDir });
  const opened: PullRequestInput[] = [];
  const outcome = await runIncident(incident, {
    store,
    agent,
    mode,
    repo: await findRepo(projectRoot),
    worktreesDir,
    install: "pnpm install --frozen-lockfile --prefer-offline --silent",
    verification: ["pnpm -C apps/sample test"],
    secrets: ["fixture-secret"],
    commandTimeoutMs: 180_000,
    pullRequest: withPullRequest
      ? {
          label: "nightshift",
          autoMerge: false,
          author: { name: "Nightshift", email: "nightshift@example.com" },
          open: async (input) => {
            opened.push(input);
            return { url: "https://github.com/someone/sample/pull/7", number: 7, autoMerge: "off", commit: "0".repeat(40) };
          },
        }
      : null,
  });
  if (outcome.status !== "fixed") {
    // Say what happened, so a failure in another environment can be read from the test output.
    for (const e of outcome.events) console.error(`[${e.step}] ${e.status}: ${e.summary}${e.status === "failed" ? `\n${JSON.stringify(e.data, null, 2)}` : ""}`);
  }
  return { outcome, opened };
}

describe.each(Object.entries(FIXTURES))("the %s fixture, in dry-run mode", (name, expected) => {
  const withPullRequest = name === "empty-title";
  let outcome: RunOutcome;
  let opened: PullRequestInput[];

  beforeAll(async () => {
    ({ outcome, opened } = await runFixture(name, withPullRequest));
  }, 300_000);

  it("ends fixed, with the diff the fixture describes", () => {
    expect(outcome.reason).toBeNull();
    expect(outcome.status).toBe("fixed");
    expect(outcome.counts).toEqual(expected.counts);
    expect(outcome.diff?.files.map((f) => f.path.split("apps/")[1])).toEqual(expected.files);
  });

  it("walks the steps in order and records each one", async () => {
    const steps = outcome.events.filter((e) => e.status === "ok").map((e) => e.step);
    expect(steps).toEqual(["worktree", "prompt", "reproduce", "fix", "verify", "review", "simple", ...(withPullRequest ? ["pr"] : []), "done"]);
    const events = await store.listEvents(outcome.runId);
    expect(events.length).toBe(outcome.events.length);
    expect(events.every((e) => e.status !== "failed")).toBe(true);
  });

  it("required the reproduction to fail before the fix and to pass after it", () => {
    const failing = outcome.events.find((e) => e.step === "reproduce" && e.status === "ok")!;
    expect(failing.summary).toMatch(/fails as it should \(exit 1\)/);
    expect(failing.data["output"]).toMatch(expected.failure);
    expect(failing.data["env"]).toEqual({ SAMPLE_BUGS: expected.flag });
    const passing = outcome.events.find((e) => e.step === "fix" && e.status === "ok")!;
    expect(passing.data["output"]).toMatch(expected.reproPasses);
  });

  it("ran the verification and the sample's symptom test stepped aside", () => {
    const verify = outcome.events.find((e) => e.step === "verify" && e.status === "info")!;
    expect(verify.data["command"]).toBe("pnpm -C apps/sample test");
    expect(verify.data["output"]).toMatch(expected.unitTests);
  });

  it("passed both gates with the recorded verdicts and no mechanical finding", () => {
    const review = outcome.events.find((e) => e.step === "review" && e.status === "ok")!;
    expect(review.data["verdict"]).toEqual({ passed: true, rule: null, reason: null });
    expect(review.data["findings"]).toEqual([]);
    const simple = outcome.events.find((e) => e.step === "simple" && e.status === "ok")!;
    expect(simple.data["verdict"]).toEqual({ passed: true, rule: null, reason: null });
    const verdict = outcome.events.filter((e) => e.step === "simple" && e.status === "info").at(-1)!;
    expect(String(verdict.data["text"])).toMatch(expected.simpleVerdict);
  });

  it("kept the prompt it sent, equal to the fixture's, and the agent's messages", async () => {
    const prompt = outcome.events.find((e) => e.step === "prompt")!;
    expect(String(prompt.data["prompt"])).toBe(await readFile(join(fixturesDir, name, "prompt.md"), "utf8"));
    const sent = String(outcome.events.find((e) => e.step === "reproduce" && e.status === "started")!.data["prompt"]);
    expect(sent.startsWith(String(prompt.data["prompt"]))).toBe(true);
    expect(sent).toContain("## This phase: the reproduction only");
    const agentMessages = outcome.events.filter((e) => e.step === "reproduce" && e.status === "info");
    expect(agentMessages.length).toBeGreaterThan(5);
    expect(agentMessages.some((e) => e.data["role"] === "tool" && (e.data["tool"] as { name: string })?.name === "Write")).toBe(true);
  });

  it(withPullRequest ? "opened the pull request from the run's record and put it on the run" : "wrote the pull request it would have opened and left the branch alone", () => {
    const pr = outcome.events.filter((e) => e.step === "pr").at(-1)!;
    expect(String(pr.data["title"])).toBe(`${expected.incidentId}: ${outcome.events[0]!.summary.replace(/^(sentry|posthog): /, "")}`);
    expect(String(pr.data["body"])).toContain("## Verification");
    expect(String(pr.data["body"])).toContain(`incident-${expected.incidentId}.test.ts`);
    if (withPullRequest) {
      expect(pr.status).toBe("ok");
      expect(pr.data["url"]).toBe("https://github.com/someone/sample/pull/7");
      expect(opened).toHaveLength(1);
      expect(opened[0]!.counts).toEqual(expected.counts);
      expect(opened[0]!.events.map((e) => e.step)).toContain("simple");
      expect(outcome.pullRequest?.number).toBe(7);
    } else {
      expect(pr.status).toBe("info");
      expect(pr.summary).toContain("NIGHTSHIFT_OPEN_PR is not set");
      expect(opened).toEqual([]);
      expect(outcome.pullRequest).toBeNull();
    }
  });

  it("left the run fixed in the store with its summary, and removed the worktree", async () => {
    const run = await store.getRun(outcome.runId);
    expect(run?.status).toBe("fixed");
    expect(run?.mode).toBe("dry-run");
    expect(run?.summary).toMatchObject({ counts: { files: expected.counts.files }, agent: `recorded:${name}`, branch: `nightshift/${expected.incidentId}`, pullRequest: { url: withPullRequest ? "https://github.com/someone/sample/pull/7" : null } });
    expect(outcome.worktreeDir).toBeNull();
  });
});
