import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sign, verifySignature } from "../src/webhooks/signature.js";

const body = '{"hello":"world"}';
const secret = "a-secret-nobody-commits";

describe("verifySignature", () => {
  it("accepts the HMAC-SHA256 hex digest of the raw body, with or without a sha256= prefix", () => {
    const digest = createHmac("sha256", secret).update(body).digest("hex");
    expect(sign(body, secret)).toBe(digest);
    expect(verifySignature(body, digest, secret)).toBe(true);
    expect(verifySignature(body, `sha256=${digest}`, secret)).toBe(true);
  });

  it("refuses a missing, malformed, wrong-length or wrong signature", () => {
    const digest = sign(body, secret);
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, "", secret)).toBe(false);
    expect(verifySignature(body, digest.slice(0, 10), secret)).toBe(false);
    expect(verifySignature(body, sign(body, "another secret"), secret)).toBe(false);
    expect(verifySignature(body + " ", digest, secret)).toBe(false);
  });

  it("refuses everything when no secret is configured, rather than accepting everything", () => {
    expect(verifySignature(body, sign(body, ""), "")).toBe(false);
  });
});
