import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAgentApp, type AgentApp } from "../src/app.js";
import { migrate, openDb, type Db } from "../src/db.js";
import { makeStore } from "../src/store.js";
import { sign } from "../src/webhooks/signature.js";

let db: Db;
let app: AgentApp;
const queued: { incidentId: string; runId: string }[] = [];
let payload: string;

beforeAll(async () => {
  db = await openDb();
  await migrate(db);
  app = await buildAgentApp({
    store: makeStore(db),
    secrets: { sentry: "sentry-secret", posthog: "posthog-secret" },
    pullRequests: { label: "nightshift", autoMerge: false },
    enqueue: async (job) => {
      queued.push(job);
      return true;
    },
  });
  await app.ready();
  payload = await readFile(new URL("../../../fixtures/empty-title/webhook.json", import.meta.url), "utf8");
});
afterAll(async () => {
  await app.close();
  await db.close();
});

const post = (url: string, body: string, headers: Record<string, string>) => app.inject({ method: "POST", url, payload: body, headers: { "content-type": "application/json", ...headers } });

describe("POST /webhooks/sentry", () => {
  it("refuses a delivery with no signature or a wrong one, before reading it", async () => {
    expect((await post("/webhooks/sentry", payload, {})).statusCode).toBe(401);
    expect((await post("/webhooks/sentry", payload, { "sentry-hook-signature": sign(payload, "another") })).statusCode).toBe(401);
    expect(queued).toEqual([]);
  });

  it("refuses a signed payload that is not an issue alert, naming what is missing", async () => {
    const body = JSON.stringify({ action: "triggered", data: { event: { title: "x" } } });
    const res = await post("/webhooks/sentry", body, { "sentry-hook-signature": sign(body, "sentry-secret") });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain("event_id");
  });

  it("accepts a signed alert, stores the incident and queues one run", async () => {
    const res = await post("/webhooks/sentry", payload, { "sentry-hook-signature": sign(payload, "sentry-secret") });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ incidentId: "inc-f42f2815", duplicate: false });
    expect(queued).toHaveLength(1);
    expect(queued[0]?.incidentId).toBe("inc-f42f2815");
    const again = await post("/webhooks/sentry", payload, { "sentry-hook-signature": sign(payload, "sentry-secret") });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ incidentId: "inc-f42f2815", duplicate: true });
    expect(queued).toHaveLength(1);
  });

  it("checks the signature over the exact bytes, so a reformatted body is refused", async () => {
    const pretty = JSON.stringify(JSON.parse(payload), null, 4);
    const res = await post("/webhooks/sentry", pretty, { "sentry-hook-signature": sign(payload, "sentry-secret") });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /webhooks/posthog", () => {
  it("takes the shared-secret signature in x-nightshift-signature", async () => {
    const body = JSON.stringify({
      event: "$exception",
      uuid: "019a1f2b-7c3d-7e4f-8a5b-6c7d8e9f0a1b",
      timestamp: "2026-11-15T22:31:04.120Z",
      properties: { $exception_message: 'duplicate key value violates unique constraint "todos_client_key"', $request_method: "POST", $request_path: "/api/todos", "sample.bugs": "double-submit" },
    });
    expect((await post("/webhooks/posthog", body, {})).statusCode).toBe(401);
    const res = await post("/webhooks/posthog", body, { "x-nightshift-signature": `sha256=${sign(body, "posthog-secret")}` });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ incidentId: "inc-019a1f2b" });
  });
});

describe("the read side", () => {
  it("lists incidents with their runs, and a run with its events", async () => {
    const list = await app.inject({ method: "GET", url: "/incidents" });
    expect(list.statusCode).toBe(200);
    const ids = list.json().incidents.map((i: { incident: { id: string } }) => i.incident.id);
    expect(ids).toContain("inc-f42f2815");
    const one = await app.inject({ method: "GET", url: "/incidents/inc-f42f2815" });
    expect(one.json().incident.title).toMatch(/todos_title_not_blank/);
    expect(one.json().runs).toHaveLength(1);
    expect(one.json().runs[0]).toMatchObject({ status: "queued", mode: "dry-run" });
    const run = await app.inject({ method: "GET", url: `/runs/${one.json().runs[0].id}` });
    expect(run.statusCode).toBe(200);
    expect(run.json()).toMatchObject({ run: { incidentId: "inc-f42f2815" }, events: [] });
    expect((await app.inject({ method: "GET", url: "/incidents/inc-00000000" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/runs/nope" })).statusCode).toBe(404);
  });

  it("answers health with the mode, the integrations that are configured and how pull requests are opened", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toEqual({ ok: true, mode: "dry-run", integrations: { sentry: true, posthog: true, agent: false, sandbox: false }, pullRequests: { label: "nightshift", autoMerge: false } });
  });

  it("serves the skills as the agent reads them, with the browser allowed to ask from another origin", async () => {
    const res = await app.inject({ method: "GET", url: "/skills", headers: { origin: "http://localhost:5173" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    const names = res.json().skills.map((s: { name: string }) => s.name);
    expect(names).toEqual(["verify", "review", "react", "simple", "prompt"]);
    expect(res.json().skills[1]).toMatchObject({ file: "review.md", gate: true });
    expect(res.json().skills[1].body).toContain("# Review");
  });
});
