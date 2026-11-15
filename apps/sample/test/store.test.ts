import { afterEach, describe, expect, it } from "vitest";
import { SEEDED_BUGS } from "../src/server/flags.js";
import { openStore, type Store } from "../src/server/store.js";

const fixed = (name: string) => Boolean(SEEDED_BUGS.find((b) => b.name === name)?.fixedBy);

let store: Store;
afterEach(async () => {
  await store?.close();
});

const key = "7b1a0d6e-2f1c-4d0a-9c1e-5d3c2b1a0f9e";

describe("the store under a double submit", () => {
  it("creates one row when two inserts with the same client key run at the same time", async () => {
    store = await openStore();
    const [a, b] = await Promise.all([store.insert({ title: "Book the dentist", clientKey: key }), store.insert({ title: "Book the dentist", clientKey: key })]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.todo.id).toBe(b.todo.id);
    expect(await store.list()).toHaveLength(1);
  });

  it.skipIf(fixed("double-submit"))("with the double-submit bug on, the second insert fails on the unique index", async () => {
    store = await openStore();
    const bugs = new Set(["double-submit"]);
    const results = await Promise.allSettled([
      store.insert({ title: "Book the dentist", clientKey: key }, bugs),
      store.insert({ title: "Book the dentist", clientKey: key }, bugs),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/duplicate key value violates unique constraint "todos_client_key"/);
  });

  it.skipIf(fixed("double-submit"))("with the bug on, a second submit that arrives later is still answered with the existing row", async () => {
    store = await openStore();
    const bugs = new Set(["double-submit"]);
    const first = await store.insert({ title: "x", clientKey: key }, bugs);
    const second = await store.insert({ title: "x", clientKey: key }, bugs);
    expect(second.created).toBe(false);
    expect(second.todo.id).toBe(first.todo.id);
  });
});

describe("the store", () => {
  it("keeps the due date as a calendar date, not a timestamp", async () => {
    store = await openStore();
    const { todo } = await store.insert({ title: "x", dueOn: "2026-11-16" });
    expect(todo.dueOn).toBe("2026-11-16");
    const updated = await store.update(todo.id, { dueOn: null });
    expect(updated?.dueOn).toBeNull();
  });

  it("refuses a blank title at the database as a last line of defence", async () => {
    store = await openStore();
    await expect(store.insert({ title: "   " })).rejects.toThrow(/todos_title_not_blank/);
  });
});
