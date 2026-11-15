import { z } from "zod";
import { flagFromTags, incidentId, renderStack, toIso, type Frame, type Incident } from "../incident.js";

const SentryFrame = z.looseObject({
  filename: z.string().optional(),
  abs_path: z.string().optional(),
  function: z.string().nullable().optional(),
  lineno: z.number().int().nullable().optional(),
  colno: z.number().int().nullable().optional(),
  in_app: z.boolean().optional(),
});

/**
 * Sentry's issue-alert webhook ("event_alert" resource): action "triggered", the event under data.event.
 * Only the fields Nightshift reads are declared; everything else is let through untouched.
 */
export const SentryWebhookSchema = z.looseObject({
  action: z.literal("triggered"),
  installation: z.looseObject({ uuid: z.string() }).optional(),
  data: z.looseObject({
    event: z.looseObject({
      event_id: z.string().min(8),
      title: z.string().min(1),
      message: z.string().optional(),
      culprit: z.string().optional(),
      transaction: z.string().optional(),
      level: z.string().optional(),
      release: z.string().nullable().optional(),
      environment: z.string().nullable().optional(),
      timestamp: z.union([z.string(), z.number()]),
      tags: z.array(z.tuple([z.string(), z.string()])).optional(),
      request: z.looseObject({ method: z.string().nullable().optional(), url: z.string().nullable().optional(), data: z.unknown().optional() }).nullable().optional(),
      exception: z
        .looseObject({
          values: z.array(z.looseObject({ type: z.string().optional(), value: z.string().optional(), stacktrace: z.looseObject({ frames: z.array(SentryFrame) }).nullable().optional() })),
        })
        .optional(),
      web_url: z.string().optional(),
    }),
    triggered_rule: z.string().optional(),
  }),
});
export type SentryWebhook = z.infer<typeof SentryWebhookSchema>;

export function parseSentry(payload: unknown): Incident {
  const hook = SentryWebhookSchema.parse(payload);
  const event = hook.data.event;
  const tags = Object.fromEntries(event.tags ?? []);
  const exception = event.exception?.values[0];
  const frames: Frame[] = (exception?.stacktrace?.frames ?? []).map((f) => ({
    filename: f.filename ?? f.abs_path ?? "?",
    function: f.function ?? "<anonymous>",
    lineno: f.lineno ?? null,
    colno: f.colno ?? null,
    inApp: f.in_app ?? false,
  }));
  const method = event.request?.method ?? null;
  const url = event.request?.url ?? null;
  const request = method && url ? { method, url, ...(event.request?.data !== undefined ? { body: event.request.data } : {}) } : null;
  const culprit = event.culprit ?? event.transaction ?? (request ? `${request.method} ${request.url}` : "unknown");
  return {
    id: incidentId(event.event_id),
    source: "sentry",
    sourceId: event.event_id,
    title: event.title,
    message: event.message ?? exception?.value ?? event.title,
    errorType: exception?.type ?? "error",
    culprit,
    request,
    frames,
    stack: renderStack(frames),
    flag: flagFromTags(tags),
    release: event.release ?? null,
    environment: event.environment ?? tags["environment"] ?? null,
    occurredAt: toIso(event.timestamp),
    url: event.web_url ?? null,
    tags,
  };
}
