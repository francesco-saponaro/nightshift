import { describe, expect, it } from "vitest";
import { redact } from "../src/agent/redact.js";

describe("redact", () => {
  it("masks API keys, bearer tokens, cookies and email addresses", () => {
    const text = [
      "export ANTHROPIC_API_KEY=sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-abcdefghijklmnop",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc",
      "Cookie: session=abc123; theme=dark",
      "x-api-key: 0123456789abcdef0123456789abcdef",
      "reported by francesco@example.com just now",
      "AKIAIOSFODNN7EXAMPLE in the env",
    ].join("\n");
    const out = redact(text);
    expect(out).not.toContain("sk-ant-");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("0123456789abcdef0123456789abcdef");
    expect(out).not.toContain("francesco@example.com");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).toContain("ANTHROPIC_API_KEY=[redacted]");
    expect(out).toContain("Authorization: Bearer [redacted]");
    expect(out).toContain("[email]");
  });

  it("masks the configured secrets wherever they appear", () => {
    const out = redact("the hook said 3dadfa02df5c411f and the secret is fixture-secret", ["fixture-secret"]);
    expect(out).toBe("the hook said 3dadfa02df5c411f and the secret is [redacted]");
  });

  it("leaves ordinary text, paths and hashes alone", () => {
    const text = "apps/sample/src/server/app.ts:91 f42f2815 todos_title_not_blank";
    expect(redact(text)).toBe(text);
  });
});
