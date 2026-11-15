import { PgBoss, type Job } from "pg-boss";
import type { Db } from "./db.js";

/**
 * The incident queue. pg-boss keeps jobs in the same database as everything else, so a restart loses nothing and
 * two workers never take the same incident. On PGlite it runs through the small adapter below.
 */
export const INCIDENTS_QUEUE = "incidents";

export interface IncidentJob {
  incidentId: string;
  runId: string;
}

export async function openQueue(db: Db): Promise<PgBoss> {
  const boss =
    db.kind === "postgres"
      ? new PgBoss({ connectionString: db.connectionString!, supervise: true, schedule: false })
      : new PgBoss({
          db: {
            executeSql: async (text: string, values?: unknown[]) => {
              if (!values || values.length === 0) {
                const { rows } = await db.exec(text);
                return { rows, rowCount: rows.length };
              }
              const { rows } = await db.query(text, values);
              return { rows, rowCount: rows.length };
            },
          },
          supervise: false,
          schedule: false,
        });
  await boss.start();
  await boss.createQueue(INCIDENTS_QUEUE);
  return boss;
}

/** Queues the run under its own id (a UUID), so the same run queued twice is one job. Returns false the second time. */
export async function enqueueIncident(boss: PgBoss, job: IncidentJob): Promise<boolean> {
  const id = await boss.send(INCIDENTS_QUEUE, job, { id: job.runId, retryLimit: 0 });
  return id !== null;
}

export async function workIncidents(boss: PgBoss, handler: (job: IncidentJob) => Promise<void>, pollingIntervalSeconds = 1): Promise<string> {
  return boss.work<IncidentJob>(INCIDENTS_QUEUE, { pollingIntervalSeconds, batchSize: 1 }, async (jobs: Job<IncidentJob>[]) => {
    for (const job of jobs) await handler(job.data);
  });
}
