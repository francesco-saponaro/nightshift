import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSentry } from "../src/webhooks/sentry.js";

const fixture = new URL("../../../fixtures/empty-title/webhook.json", import.meta.url);

describe("parseSentry", () => {
  it("turns an issue-alert webhook into an incident", async () => {
    const payload = JSON.parse(await readFile(fixture, "utf8"));
    const incident = parseSentry(payload);
    expect(incident.source).toBe("sentry");
    expect(incident.id).toBe("inc-f42f2815");
    expect(incident.title).toBe('new row for relation "todos" violates check constraint "todos_title_not_blank"');
    expect(incident.culprit).toBe("POST /api/todos");
    expect(incident.request).toEqual({ method: "POST", url: "/api/todos", body: { title: "", dueOn: "2026-11-16" } });
    expect(incident.flag).toBe("empty-title");
    expect(incident.release).toBe("sample@0.1.0");
    expect(incident.environment).toBe("production");
    expect(incident.occurredAt).toBe("2026-11-15T22:27:07.773Z");
    expect(incident.url).toMatch(/^https:\/\/sentry\.example\//);
    expect(incident.frames).toHaveLength(5);
    expect(incident.frames.at(-1)).toMatchObject({ function: "pe.Oe", lineno: 442 });
    expect(incident.stack.split("\n")).toHaveLength(5);
    expect(incident.stack).toContain("at pe.Oe (/app/node_modules/.pnpm/@electric-sql+pglite@0.5.16/node_modules/@electric-sql/pg-protocol/src/parser.ts:442:11)  [library]");
  });

  it("reads Sentry's own unix timestamp and a missing release", () => {
    const incident = parseSentry({
      action: "triggered",
      data: {
        event: {
          event_id: "0123456789abcdef0123456789abcdef",
          title: "TypeError: Cannot read properties of undefined (reading 'trim')",
          culprit: "POST /api/todos",
          timestamp: 1794781627.773,
          tags: [["sample.bugs", "empty-title"]],
          exception: { values: [{ type: "TypeError", value: "Cannot read properties of undefined (reading 'trim')", stacktrace: { frames: [] } }] },
        },
      },
    });
    expect(incident.occurredAt).toBe("2026-11-15T22:27:07.773Z");
    expect(incident.release).toBeNull();
    expect(incident.request).toBeNull();
    expect(incident.id).toBe("inc-01234567");
  });

  it("refuses a payload that is not an issue alert", () => {
    expect(() => parseSentry({ action: "created", data: {} })).toThrow();
    expect(() => parseSentry({ action: "triggered", data: { event: { title: "x" } } })).toThrow(/event_id/);
  });
});
