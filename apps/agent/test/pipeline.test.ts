import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chooseAgent } from "../src/agent/select.js";
import { migrate, openDb, type Db } from "../src/db.js";
import { runIncident, type RunOutcome } from "../src/pipeline/run.js";
import { findRepo } from "../src/pipeline/worktree.js";
import { makeStore, type Store } from "../src/store.js";
import { parseSentry } from "../src/webhooks/sentry.js";

/**
 * The fixture run, end to end, in dry-run mode: a real worktree of this repository at HEAD, a real install, the
 * recorded agent's patches applied, the reproduction run and required to fail, the fix applied and the reproduction
 * required to pass, the sample app's unit tests, the two gates on the real diff. Only the agent is replayed.
 */
const fixtureDir = fileURLToPath(new URL("../../../fixtures/empty-title/", import.meta.url)).replace(/\/$/, "");
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");

let db: Db;
let store: Store;
let worktreesDir: string;
let outcome: RunOutcome;

beforeAll(async () => {
  db = await openDb();
  await migrate(db);
  store = makeStore(db);
  worktreesDir = await mkdtemp(join(tmpdir(), "nightshift-runs-"));
  const incident = parseSentry(JSON.parse(await readFile(join(fixtureDir, "webhook.json"), "utf8")));
  await store.saveIncident(incident, {});
  const { agent, mode } = await chooseAgent({ env: {}, fixtureDir });
  outcome = await runIncident(incident, {
    store,
    agent,
    mode,
    repo: await findRepo(projectRoot),
    worktreesDir,
    install: "pnpm install --frozen-lockfile --prefer-offline --silent",
    verification: ["pnpm -C apps/sample test"],
    secrets: ["fixture-secret"],
    commandTimeoutMs: 180_000,
  });
  if (outcome.status !== "fixed") {
    // Say what happened, so a failure in another environment can be read from the test output.
    for (const e of outcome.events) console.error(`[${e.step}] ${e.status}: ${e.summary}${e.status === "failed" ? `\n${JSON.stringify(e.data, null, 2)}` : ""}`);
  }
}, 300_000);

afterAll(async () => {
  await db.close();
  await rm(worktreesDir, { recursive: true, force: true });
});

describe("the fixture run, in dry-run mode", () => {
  it("ends fixed, with the diff the fixture describes", () => {
    expect(outcome.reason).toBeNull();
    expect(outcome.status).toBe("fixed");
    expect(outcome.counts).toEqual({ files: 3, added: 34, removed: 10, newFiles: 1 });
    expect(outcome.diff?.files.map((f) => f.path.split("apps/")[1])).toEqual(["sample/src/server/app.ts", "sample/src/server/flags.ts", "sample/test/incident-inc-f42f2815.test.ts"]);
  });

  it("walks the steps in order and records each one", async () => {
    const steps = outcome.events.filter((e) => e.status === "ok").map((e) => e.step);
    expect(steps).toEqual(["worktree", "prompt", "reproduce", "fix", "verify", "review", "simple", "done"]);
    const events = await store.listEvents(outcome.runId);
    expect(events.length).toBe(outcome.events.length);
    expect(events.every((e) => e.status !== "failed")).toBe(true);
  });

  it("required the reproduction to fail before the fix and to pass after it", () => {
    const failing = outcome.events.find((e) => e.step === "reproduce" && e.status === "ok")!;
    expect(failing.summary).toMatch(/fails as it should \(exit 1\)/);
    expect(failing.data["output"]).toMatch(/expected 500 to be 400/);
    expect(failing.data["env"]).toEqual({ SAMPLE_BUGS: "empty-title" });
    const passing = outcome.events.find((e) => e.step === "fix" && e.status === "ok")!;
    expect(passing.data["output"]).toMatch(/2 passed/);
  });

  it("ran the verification and the sample's symptom test stepped aside", () => {
    const verify = outcome.events.find((e) => e.step === "verify" && e.status === "info")!;
    expect(verify.data["command"]).toBe("pnpm -C apps/sample test");
    expect(verify.data["output"]).toMatch(/26 passed \| 1 skipped/);
  });

  it("passed both gates with the recorded verdicts and no mechanical finding", () => {
    const review = outcome.events.find((e) => e.step === "review" && e.status === "ok")!;
    expect(review.data["verdict"]).toEqual({ passed: true, rule: null, reason: null });
    expect(review.data["findings"]).toEqual([]);
    const simple = outcome.events.find((e) => e.step === "simple" && e.status === "ok")!;
    expect(simple.data["verdict"]).toEqual({ passed: true, rule: null, reason: null });
  });

  it("kept the prompt it sent, equal to the fixture's, and the agent's messages", () => {
    const prompt = outcome.events.find((e) => e.step === "prompt")!;
    const sent = String(outcome.events.find((e) => e.step === "reproduce" && e.status === "started")!.data["prompt"]);
    expect(sent.startsWith(String(prompt.data["prompt"]))).toBe(true);
    expect(sent).toContain("## This phase: the reproduction only");
    const agentMessages = outcome.events.filter((e) => e.step === "reproduce" && e.status === "info");
    expect(agentMessages.length).toBeGreaterThan(5);
    expect(agentMessages.some((e) => e.data["role"] === "tool" && (e.data["tool"] as { name: string })?.name === "Write")).toBe(true);
  });

  it("left the run fixed in the store with its summary, and removed the worktree", async () => {
    const run = await store.getRun(outcome.runId);
    expect(run?.status).toBe("fixed");
    expect(run?.mode).toBe("dry-run");
    expect(run?.summary).toMatchObject({ counts: { files: 3 }, agent: "recorded:empty-title", branch: "nightshift/inc-f42f2815" });
    expect(outcome.worktreeDir).toBeNull();
  });
});
