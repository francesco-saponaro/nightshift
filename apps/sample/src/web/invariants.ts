import { daysUntil } from "../server/dates.js";

/**
 * The browser can see the calendar too. When the server's day count for a due date disagrees with it, that is a
 * bug worth an incident even though nothing threw, so it is captured the way an exception would be.
 */
export function daysLeftDisagrees(dueOn: string | null, daysLeft: number | null, now: Date): string | null {
  if (!dueOn || daysLeft === null) return null;
  const expected = daysUntil(dueOn, now);
  if (expected === daysLeft) return null;
  return `daysLeft for ${dueOn} is ${daysLeft} but the calendar says ${expected} at ${now.toISOString()}`;
}

declare global {
  interface Window {
    posthog?: { captureException?: (error: Error, properties?: Record<string, unknown>) => void };
  }
}

/** Hands the error to the error tracker's browser SDK when one is loaded; a no-op otherwise. */
export function captureException(error: Error, properties: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  window.posthog?.captureException?.(error, properties);
}
