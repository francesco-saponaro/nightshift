import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type SampleApp } from "../src/server/app.js";
import { SEEDED_BUGS } from "../src/server/flags.js";
import type { ReportedError } from "../src/server/report.js";

// Each seeded bug's symptom is documented here while the bug is still in the code. Once a run has retired it (fixedBy
// on its entry in flags.ts), the symptom test steps aside and the reproduction test named after the incident takes over.
const fixed = (name: string) => Boolean(SEEDED_BUGS.find((b) => b.name === name)?.fixedBy);

const now = () => new Date("2026-11-15T22:40:00Z");

let apps: SampleApp[] = [];
async function make(options: { bugs?: string[] } = {}) {
  const reported: ReportedError[] = [];
  const app = await buildApp({
    bugs: new Set(options.bugs ?? []),
    now,
    report: (e) => {
      reported.push(e);
    },
  });
  await app.ready();
  apps.push(app);
  return { app, reported };
}

afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

describe("the to-do API", () => {
  it("starts empty and reports which bugs are on", async () => {
    const { app } = await make({ bugs: ["double-submit"] });
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.json()).toEqual({ ok: true, bugs: ["double-submit"] });
    const list = await app.inject({ method: "GET", url: "/api/todos" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ todos: [] });
  });

  it("creates a to-do with a due date and says how many days are left", async () => {
    const { app } = await make();
    const res = await app.inject({
      method: "POST",
      url: "/api/todos",
      payload: { title: "Renew the passport", dueOn: "2026-11-16" },
    });
    expect(res.statusCode).toBe(201);
    const todo = res.json();
    expect(todo).toMatchObject({ title: "Renew the passport", dueOn: "2026-11-16", done: false, daysLeft: 1 });
    expect(typeof todo.id).toBe("string");
    const list = await app.inject({ method: "GET", url: "/api/todos" });
    expect(list.json().todos).toHaveLength(1);
  });

  it("accepts a to-do without a due date", async () => {
    const { app } = await make();
    const res = await app.inject({ method: "POST", url: "/api/todos", payload: { title: "Water the plants" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ dueOn: null, daysLeft: null });
  });

  it("refuses an empty title with a 400 that names the field", async () => {
    const { app, reported } = await make();
    for (const title of ["", "   "]) {
      const res = await app.inject({ method: "POST", url: "/api/todos", payload: { title } });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "validation" });
      expect(JSON.stringify(res.json().issues)).toContain("title");
    }
    expect(reported).toHaveLength(0);
  });

  it("refuses a due date that is not a calendar date", async () => {
    const { app } = await make();
    const res = await app.inject({ method: "POST", url: "/api/todos", payload: { title: "x", dueOn: "tomorrow" } });
    expect(res.statusCode).toBe(400);
  });

  it("marks a to-do done and deletes it", async () => {
    const { app } = await make();
    const created = (await app.inject({ method: "POST", url: "/api/todos", payload: { title: "Call mum" } })).json();
    const patched = await app.inject({ method: "PATCH", url: `/api/todos/${created.id}`, payload: { done: true } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().done).toBe(true);
    const deleted = await app.inject({ method: "DELETE", url: `/api/todos/${created.id}` });
    expect(deleted.statusCode).toBe(204);
    const missing = await app.inject({ method: "PATCH", url: `/api/todos/${created.id}`, payload: { done: false } });
    expect(missing.statusCode).toBe(404);
  });

  it("creates one to-do when the same client key is sent twice at once", async () => {
    const { app, reported } = await make();
    const payload = { title: "Book the dentist", clientKey: "7b1a0d6e-2f1c-4d0a-9c1e-5d3c2b1a0f9e" };
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: "/api/todos", payload }),
      app.inject({ method: "POST", url: "/api/todos", payload }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().id).toBe(b.json().id);
    const list = await app.inject({ method: "GET", url: "/api/todos" });
    expect(list.json().todos).toHaveLength(1);
    expect(reported).toHaveLength(0);
  });
});

describe("the seeded bugs, switched on", () => {
  it.skipIf(fixed("empty-title"))("empty-title: an empty title reaches the database and comes back as a 500", async () => {
    const { app, reported } = await make({ bugs: ["empty-title"] });
    const res = await app.inject({ method: "POST", url: "/api/todos", payload: { title: "" } });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal" });
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toMatch(/todos_title_not_blank/);
    expect(reported[0]?.request).toMatchObject({ method: "POST", url: "/api/todos" });
  });

  it.skipIf(fixed("date-off-by-one"))("date-off-by-one: a to-do due tomorrow, added late in the evening, says it is due today", async () => {
    const { app } = await make({ bugs: ["date-off-by-one"] });
    const res = await app.inject({ method: "POST", url: "/api/todos", payload: { title: "x", dueOn: "2026-11-16" } });
    expect(res.json().daysLeft).toBe(0);
  });

  it.skipIf(fixed("double-submit"))("double-submit: two requests with the same client key race and one of them is a 500", async () => {
    const { app, reported } = await make({ bugs: ["double-submit"] });
    const payload = { title: "Book the dentist", clientKey: "7b1a0d6e-2f1c-4d0a-9c1e-5d3c2b1a0f9e" };
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: "/api/todos", payload }),
      app.inject({ method: "POST", url: "/api/todos", payload }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 500]);
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toMatch(/duplicate key/);
  });
});
