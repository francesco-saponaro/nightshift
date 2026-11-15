import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { daysUntil } from "./dates.js";
import type { Reporter } from "./report.js";
import { openStore, type Store, type TodoRow } from "./store.js";

export interface SampleAppOptions {
  bugs?: ReadonlySet<string>;
  now?: () => Date;
  databaseUrl?: string;
  report?: Reporter;
  logger?: boolean;
}

export type SampleApp = FastifyInstance;

export interface Todo extends TodoRow {
  daysLeft: number | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dueOn = z
  .string()
  .regex(DATE, "a calendar date, YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "a real calendar date");

const strictTitle = z.string().trim().min(1, "the title cannot be empty").max(200, "200 characters at most");
// With the empty-title bug on, a blank title is let through and the database refuses it instead.
const looseTitle = z.string().max(200);

function newTodoSchema(bugs: ReadonlySet<string>) {
  return z.strictObject({
    title: bugs.has("empty-title") ? looseTitle : strictTitle,
    dueOn: dueOn.nullable().optional(),
    clientKey: z.string().uuid().optional(),
  });
}

const patchSchema = z
  .strictObject({
    title: strictTitle.optional(),
    dueOn: dueOn.nullable().optional(),
    done: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "nothing to change");

const idParams = z.object({ id: z.string().uuid() });

export async function buildApp(options: SampleAppOptions = {}): Promise<SampleApp> {
  const bugs = options.bugs ?? new Set<string>();
  const now = options.now ?? (() => new Date());
  const report = options.report;
  const store: Store = await openStore(options.databaseUrl);
  const app = Fastify({ logger: options.logger ?? false });

  const present = (row: TodoRow): Todo => ({ ...row, daysLeft: row.dueOn ? daysUntil(row.dueOn, now(), bugs) : null });

  app.addHook("onClose", async () => {
    await store.close();
  });

  app.setErrorHandler(async (thrown: unknown, request, reply) => {
    const error: Error & { statusCode?: number } = thrown instanceof Error ? thrown : new Error(String(thrown));
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: "validation", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    const status = typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) {
      request.log.error(error);
      await report?.({
        name: error.name,
        message: error.message,
        stack: error.stack,
        request: { method: request.method, url: request.url, body: request.body },
        bugs: [...bugs],
        at: now(),
      });
      return reply.status(500).send({ error: "internal" });
    }
    return reply.status(status).send({ error: error.message });
  });

  app.get("/health", async () => ({ ok: true, bugs: [...bugs] }));

  app.get("/api/todos", async () => {
    const rows = await store.list();
    return { todos: rows.map(present) };
  });

  app.post("/api/todos", async (request, reply) => {
    const input = newTodoSchema(bugs).parse(request.body);
    const { todo, created } = await store.insert(input, bugs);
    return reply.status(created ? 201 : 200).send(present(todo));
  });

  app.patch("/api/todos/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const patch = patchSchema.parse(request.body);
    const row = await store.update(id, patch);
    if (!row) return reply.status(404).send({ error: "not_found" });
    return present(row);
  });

  app.delete("/api/todos/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const removed = await store.remove(id);
    if (!removed) return reply.status(404).send({ error: "not_found" });
    return reply.status(204).send();
  });

  return app;
}
