import { z } from "zod";
import { incidentId, renderStack, toIso, type Frame, type Incident } from "../incident.js";

const PostHogFrame = z.looseObject({
  filename: z.string().optional(),
  function: z.string().nullable().optional(),
  lineno: z.number().int().nullable().optional(),
  colno: z.number().int().nullable().optional(),
  in_app: z.boolean().optional(),
});

/**
 * A PostHog `$exception` event, as a webhook destination delivers it with the event's uuid, timestamp and properties.
 * The error-tracking properties ($exception_list, $exception_fingerprint) are PostHog's; `sample.bugs`, `release`,
 * `$request_method` and `$request_path` are what the sample app sets on its events.
 */
export const PostHogWebhookSchema = z.looseObject({
  event: z.literal("$exception", { error: "only $exception events become incidents" }),
  uuid: z.string().min(8),
  distinct_id: z.string().optional(),
  timestamp: z.string(),
  properties: z.looseObject({
    $exception_list: z.array(z.looseObject({ type: z.string().optional(), value: z.string().optional(), stacktrace: z.looseObject({ frames: z.array(PostHogFrame).optional() }).optional() })).optional(),
    $exception_message: z.string().optional(),
    $exception_type: z.string().optional(),
    $exception_fingerprint: z.string().optional(),
    $current_url: z.string().optional(),
    $request_method: z.string().optional(),
    $request_path: z.string().optional(),
    $environment: z.string().optional(),
    release: z.string().optional(),
    "sample.bugs": z.string().optional(),
  }),
});
export type PostHogWebhook = z.infer<typeof PostHogWebhookSchema>;

export function parsePostHog(payload: unknown): Incident {
  const hook = PostHogWebhookSchema.parse(payload);
  const p = hook.properties;
  const exception = p.$exception_list?.[0];
  const title = exception?.value ?? p.$exception_message;
  if (!title) throw new Error("the $exception event carries neither $exception_list nor $exception_message");
  const frames: Frame[] = (exception?.stacktrace?.frames ?? []).map((f) => ({
    filename: f.filename ?? "?",
    function: f.function ?? "<anonymous>",
    lineno: f.lineno ?? null,
    colno: f.colno ?? null,
    inApp: f.in_app ?? false,
  }));
  const request = p.$request_method && p.$request_path ? { method: p.$request_method, url: p.$request_path } : null;
  const tags: Record<string, string> = {};
  if (p.$exception_fingerprint) tags["fingerprint"] = p.$exception_fingerprint;
  if (p["sample.bugs"]) tags["sample.bugs"] = p["sample.bugs"];
  if (p.$current_url) tags["url"] = p.$current_url;
  if (hook.distinct_id) tags["distinct_id"] = hook.distinct_id;
  return {
    id: incidentId(hook.uuid),
    source: "posthog",
    sourceId: hook.uuid,
    title,
    message: title,
    errorType: exception?.type ?? p.$exception_type ?? "error",
    culprit: request ? `${request.method} ${request.url}` : "unknown",
    request,
    frames,
    stack: renderStack(frames),
    flag: p["sample.bugs"]?.split(",").map((s) => s.trim()).find(Boolean) ?? null,
    release: p.release ?? null,
    environment: p.$environment ?? null,
    occurredAt: toIso(hook.timestamp),
    url: null,
    tags,
  };
}
