import { z } from "zod";

/** One frame of a stack, as the tracker had it. Frames are ordered oldest first, so the last one is where it broke. */
export const FrameSchema = z.object({
  filename: z.string(),
  function: z.string(),
  lineno: z.number().int().nullable(),
  colno: z.number().int().nullable(),
  inApp: z.boolean(),
});
export type Frame = z.infer<typeof FrameSchema>;

export const IncidentSchema = z.object({
  /** Nightshift's own id: inc- and the first eight characters of the tracker's event id. */
  id: z.string().regex(/^inc-[0-9a-f]{8}$/),
  source: z.enum(["sentry", "posthog"]),
  sourceId: z.string().min(1),
  title: z.string().min(1),
  message: z.string(),
  errorType: z.string(),
  culprit: z.string().min(1),
  request: z.object({ method: z.string(), url: z.string(), body: z.unknown().optional() }).nullable(),
  frames: z.array(FrameSchema),
  stack: z.string(),
  /** The seeded bug that was on when it happened, from the `sample.bugs` tag. */
  flag: z.string().nullable(),
  release: z.string().nullable(),
  environment: z.string().nullable(),
  occurredAt: z.string().datetime(),
  url: z.string().nullable(),
  tags: z.record(z.string(), z.string()),
});
export type Incident = z.infer<typeof IncidentSchema>;

export function incidentId(sourceEventId: string): string {
  const hex = sourceEventId.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length < 8) throw new Error(`event id "${sourceEventId}" is too short to make an incident id from`);
  return `inc-${hex.slice(0, 8)}`;
}

/** The stack as one line per frame, oldest first, in the shape Node prints so the agent reads it without thinking. */
export function renderStack(frames: Frame[]): string {
  return frames.map((f) => `    at ${f.function} (${f.filename}:${f.lineno ?? "?"}:${f.colno ?? "?"})${f.inApp ? "" : "  [library]"}`).join("\n");
}

export function flagFromTags(tags: Record<string, string>): string | null {
  const value = tags["sample.bugs"];
  if (!value) return null;
  const first = value.split(",").map((s) => s.trim()).find(Boolean);
  return first ?? null;
}

export function toIso(value: string | number): string {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`"${value}" is not a time`);
  return date.toISOString();
}
