import { loadSkills } from "@nightshift/skills";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Incident } from "./incident.js";
import type { IncidentJob } from "./queue.js";
import type { Store } from "./store.js";
import { parsePostHog } from "./webhooks/posthog.js";
import { parseSentry } from "./webhooks/sentry.js";
import { verifySignature } from "./webhooks/signature.js";

export interface AgentAppOptions {
  store: Store;
  secrets: { sentry: string; posthog: string };
  /** Puts a run on the queue; false when the run was already queued. */
  enqueue: (job: IncidentJob) => Promise<boolean>;
  mode?: "dry-run" | "live";
  sandbox?: boolean;
  /** How pull requests are opened, or null when they are not. */
  pullRequests?: { label: string; autoMerge: boolean } | null;
  logger?: boolean;
}

export type AgentApp = FastifyInstance;

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

/**
 * The webhook side of Nightshift: two endpoints the error trackers call, each checked against its secret over the raw
 * bytes before the body is even parsed, and a small read API the dashboard uses. The worker is elsewhere; this
 * process only records the incident and queues the run. The read API answers any origin: it holds nothing a
 * browser could misuse (no writes, no secrets, the transcripts already redacted), and the dashboard is served from
 * another port in development and another host in production.
 */
export async function buildAgentApp(options: AgentAppOptions): Promise<AgentApp> {
  const { store } = options;
  const mode = options.mode ?? "dry-run";
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 1024 * 1024 });

  // Keep the raw bytes: an HMAC over a re-serialised body is not the signature the sender computed.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    request.rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch {
      done(Object.assign(new Error("the body is not JSON"), { statusCode: 400 }));
    }
  });

  app.setErrorHandler(async (thrown: unknown, _request, reply) => {
    const error: Error & { statusCode?: number } = thrown instanceof Error ? thrown : new Error(String(thrown));
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: "payload", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    const status = typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) app.log.error(error);
    return reply.status(status).send({ error: status === 500 ? "internal" : error.message });
  });

  async function receive(request: FastifyRequest, reply: FastifyReply, header: string, secret: string, parse: (payload: unknown) => Incident) {
    const signature = request.headers[header];
    if (!verifySignature(request.rawBody ?? "", typeof signature === "string" ? signature : undefined, secret)) {
      return reply.status(401).send({ error: "signature" });
    }
    const incident = parse(request.body);
    const { created } = await store.saveIncident(incident, request.body);
    if (!created) return reply.status(200).send({ incidentId: incident.id, duplicate: true });
    const runId = randomUUID();
    await store.createRun({ id: runId, incidentId: incident.id, mode });
    await options.enqueue({ incidentId: incident.id, runId });
    return reply.status(202).send({ incidentId: incident.id, runId, duplicate: false });
  }

  app.post("/webhooks/sentry", (request, reply) => receive(request, reply, "sentry-hook-signature", options.secrets.sentry, parseSentry));
  app.post("/webhooks/posthog", (request, reply) => receive(request, reply, "x-nightshift-signature", options.secrets.posthog, parsePostHog));

  app.addHook("onSend", async (request, reply) => {
    if (request.method === "GET") reply.header("access-control-allow-origin", "*");
  });

  app.get("/health", async () => ({
    ok: true,
    mode,
    integrations: { sentry: Boolean(options.secrets.sentry), posthog: Boolean(options.secrets.posthog), agent: mode === "live", sandbox: Boolean(options.sandbox) },
    pullRequests: options.pullRequests ?? null,
  }));

  app.get("/skills", async () => ({ skills: await loadSkills() }));

  app.get("/incidents", async () => {
    const incidents = await store.listIncidents();
    const runs = await store.listRuns();
    return { incidents: incidents.map((row) => ({ ...row, runs: runs.filter((r) => r.incidentId === row.incident.id) })) };
  });

  app.get("/incidents/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().regex(/^inc-[0-9a-f]{8}$/) }).parse(request.params);
    const row = await store.getIncident(id);
    if (!row) return reply.status(404).send({ error: "not_found" });
    return { ...row, runs: await store.listRuns(id) };
  });

  app.get("/runs/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(64) }).parse(request.params);
    const run = await store.getRun(id);
    if (!run) return reply.status(404).send({ error: "not_found" });
    return { run, events: await store.listEvents(id) };
  });

  return app;
}
