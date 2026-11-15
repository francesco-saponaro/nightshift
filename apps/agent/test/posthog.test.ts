import { describe, expect, it } from "vitest";
import { parsePostHog } from "../src/webhooks/posthog.js";

const exception = {
  event: "$exception",
  uuid: "019a1f2b-7c3d-7e4f-8a5b-6c7d8e9f0a1b",
  distinct_id: "user-42",
  timestamp: "2026-11-15T22:31:04.120Z",
  properties: {
    $exception_list: [
      {
        type: "error",
        value: 'duplicate key value violates unique constraint "todos_client_key"',
        stacktrace: {
          type: "raw",
          frames: [
            { filename: "/app/apps/sample/src/server/app.ts", function: "Object.<anonymous>", lineno: 91, colno: 50, in_app: true },
            { filename: "/app/apps/sample/src/server/store.ts", function: "insert", lineno: 82, colno: 28, in_app: true },
          ],
        },
      },
    ],
    $exception_fingerprint: "duplicate-key-todos-client-key",
    $current_url: "http://127.0.0.1:3000/",
    $request_method: "POST",
    $request_path: "/api/todos",
    "sample.bugs": "double-submit",
    release: "sample@0.1.0",
    $environment: "production",
  },
};

describe("parsePostHog", () => {
  it("turns an $exception event into an incident", () => {
    const incident = parsePostHog(exception);
    expect(incident.source).toBe("posthog");
    expect(incident.id).toBe("inc-019a1f2b");
    expect(incident.title).toBe('duplicate key value violates unique constraint "todos_client_key"');
    expect(incident.culprit).toBe("POST /api/todos");
    expect(incident.request).toEqual({ method: "POST", url: "/api/todos" });
    expect(incident.flag).toBe("double-submit");
    expect(incident.release).toBe("sample@0.1.0");
    expect(incident.occurredAt).toBe("2026-11-15T22:31:04.120Z");
    expect(incident.frames.at(-1)).toMatchObject({ function: "insert", lineno: 82 });
    expect(incident.tags["fingerprint"]).toBe("duplicate-key-todos-client-key");
  });

  it("falls back to the message when there is no exception list", () => {
    const incident = parsePostHog({ event: "$exception", uuid: exception.uuid, timestamp: exception.timestamp, properties: { $exception_message: "boom" } });
    expect(incident.title).toBe("boom");
    expect(incident.culprit).toBe("unknown");
    expect(incident.flag).toBeNull();
  });

  it("refuses anything that is not an $exception event", () => {
    expect(() => parsePostHog({ event: "$pageview", uuid: exception.uuid, timestamp: exception.timestamp, properties: {} })).toThrow(/\$exception/);
  });
});
