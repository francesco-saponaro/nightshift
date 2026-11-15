import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openDb, type Db } from "../src/db.js";
import { enqueueIncident, openQueue, workIncidents, type IncidentJob } from "../src/queue.js";
import { makeStore, type Store } from "../src/store.js";
import { parseSentry } from "../src/webhooks/sentry.js";

let db: Db;
let store: Store;
beforeAll(async () => {
  db = await openDb();
  await migrate(db);
  store = makeStore(db);
});
afterAll(async () => {
  await db.close();
});

async function incident() {
  return parseSentry(JSON.parse(await readFile(new URL("../../../fixtures/empty-title/webhook.json", import.meta.url), "utf8")));
}

describe("the store", () => {
  it("keeps an incident once and reads it back whole", async () => {
    const inc = await incident();
    expect(await store.saveIncident(inc, { raw: true })).toEqual({ created: true });
    expect(await store.saveIncident(inc, { raw: true })).toEqual({ created: false });
    const row = await store.getIncident(inc.id);
    expect(row?.incident).toEqual(inc);
    expect((await store.listIncidents()).map((r) => r.incident.id)).toEqual([inc.id]);
  });

  it("records a run and its events in order, with a sequence number per run", async () => {
    const inc = await incident();
    await store.createRun({ id: "run-1", incidentId: inc.id, mode: "dry-run" });
    await store.updateRun("run-1", { status: "running", step: "worktree", worktree: "/tmp/x", branch: "nightshift/inc" });
    const first = await store.appendEvent({ runId: "run-1", step: "worktree", status: "started", summary: "checking out", data: {} });
    const second = await store.appendEvent({ runId: "run-1", step: "worktree", status: "ok", summary: "checked out", data: { base: "abc" } });
    expect([first.seq, second.seq]).toEqual([1, 2]);
    const events = await store.listEvents("run-1");
    expect(events.map((e) => [e.seq, e.step, e.status])).toEqual([
      [1, "worktree", "started"],
      [2, "worktree", "ok"],
    ]);
    expect(events[1]?.data).toEqual({ base: "abc" });
    await store.updateRun("run-1", { status: "fixed", finished: true, summary: { files: 3 } });
    const run = await store.getRun("run-1");
    expect(run).toMatchObject({ status: "fixed", step: "worktree", worktree: "/tmp/x", summary: { files: 3 } });
    expect(run?.finishedAt).not.toBeNull();
    expect((await store.listRuns(inc.id)).map((r) => r.id)).toEqual(["run-1"]);
  });
});

describe("the queue on the same database", () => {
  it("hands an incident to a worker once, even when it is queued twice", async () => {
    const boss = await openQueue(db);
    const seen: IncidentJob[] = [];
    await workIncidents(boss, async (job) => void seen.push(job), 0.5);
    const runId = "7d1c2a6e-3b4f-4c5d-8e9f-0a1b2c3d4e5f";
    expect(await enqueueIncident(boss, { incidentId: "inc-f42f2815", runId })).toBe(true);
    expect(await enqueueIncident(boss, { incidentId: "inc-f42f2815", runId })).toBe(false);
    await new Promise((r) => setTimeout(r, 1500));
    expect(seen).toEqual([{ incidentId: "inc-f42f2815", runId }]);
    await boss.stop({ graceful: false });
  });
});
