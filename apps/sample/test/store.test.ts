import { afterEach, describe, expect, it } from "vitest";
import { openStore, type Store } from "../src/server/store.js";

// The double-submit symptom is documented in api.test.ts, through the app, so that this file still compiles once the
// fix has removed the bug's branch and its argument.

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
