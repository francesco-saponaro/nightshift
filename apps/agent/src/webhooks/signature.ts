import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 of the raw body, hex. Sentry sends it as `sentry-hook-signature`; PostHog deliveries carry it as `x-nightshift-signature`. */
export function sign(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Constant-time check of a signature header. A missing secret refuses everything: an unsigned webhook endpoint is an
 * endpoint anyone can push work into.
 */
export function verifySignature(rawBody: string, header: string | undefined, secret: string): boolean {
  if (!secret || !header) return false;
  const given = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = Buffer.from(sign(rawBody, secret), "hex");
  const actual = Buffer.from(given, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
