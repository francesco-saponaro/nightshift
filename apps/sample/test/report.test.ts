import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sentryEvent, webhookReporter, type ReportedError } from "../src/server/report.js";

const error: ReportedError = {
  message: 'new row for relation "todos" violates check constraint "todos_title_not_blank"',
  name: "error",
  stack: 'error: new row for relation "todos" violates check constraint "todos_title_not_blank"\n    at insertTodo (file:///app/src/server/store.ts:41:17)\n    at Object.<anonymous> (file:///app/src/server/app.ts:62:20)',
  request: { method: "POST", url: "/api/todos", body: { title: "" } },
  bugs: ["empty-title"],
  at: new Date("2026-11-15T22:41:12Z"),
};

describe("sentryEvent", () => {
  it("shapes the error the way Sentry's issue-alert webhook does", () => {
    const event = sentryEvent(error, "sample@0.1.0");
    expect(event.action).toBe("triggered");
    expect(event.data.event.title).toBe(error.message);
    expect(event.data.event.culprit).toBe("POST /api/todos");
    expect(event.data.event.release).toBe("sample@0.1.0");
    expect(event.data.event.tags).toContainEqual(["sample.bugs", "empty-title"]);
    expect(event.data.event.request).toMatchObject({ method: "POST", url: "/api/todos" });
    const frames = event.data.event.exception.values[0]?.stacktrace.frames ?? [];
    expect(frames.at(-1)).toMatchObject({ function: "insertTodo", lineno: 41, colno: 17 });
    expect(frames[0]?.filename).toContain("app.ts");
    expect(event.data.event.timestamp).toBe("2026-11-15T22:41:12.000Z");
  });
});

describe("webhookReporter", () => {
  it("posts the event, signed with the secret the way Sentry signs it", async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return new Response(null, { status: 202 });
    };
    const report = webhookReporter({ url: "http://localhost:4000/webhooks/sentry", secret: "shh", release: "sample@0.1.0", fetch });
    await report(error);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("http://localhost:4000/webhooks/sentry");
    expect(call.headers["content-type"]).toBe("application/json");
    expect(call.headers["sentry-hook-resource"]).toBe("event_alert");
    expect(call.headers["sentry-hook-signature"]).toBe(createHmac("sha256", "shh").update(call.body).digest("hex"));
    expect(JSON.parse(call.body).data.event.title).toBe(error.message);
  });

  it("never throws into the request that failed, even when the tracker is down", async () => {
    const fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const warnings: string[] = [];
    const report = webhookReporter({ url: "http://localhost:4000/webhooks/sentry", secret: "shh", release: "x", fetch, warn: (m) => warnings.push(m) });
    await expect(report(error)).resolves.toBeUndefined();
    expect(warnings[0]).toMatch(/ECONNREFUSED/);
  });
});
