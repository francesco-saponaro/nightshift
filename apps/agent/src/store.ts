import type { Db } from "./db.js";
import type { Incident } from "./incident.js";

/** Reads and writes for incidents, runs and their events. Every row goes through here, so the dashboard and the worker agree. */

export type RunStatus = "queued" | "running" | "fixed" | "failed";
export type EventStatus = "started" | "ok" | "failed" | "info";

export interface RunRow {
  id: string;
  incidentId: string;
  mode: "dry-run" | "live";
  status: RunStatus;
  step: string | null;
  startedAt: string;
  finishedAt: string | null;
  worktree: string | null;
  branch: string | null;
  summary: Record<string, unknown>;
}

export interface RunEvent {
  runId: string;
  seq: number;
  step: string;
  status: EventStatus;
  at: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface IncidentRow {
  incident: Incident;
  receivedAt: string;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : new Date(String(v)).toISOString());

export function makeStore(db: Db) {
  return {
    /** Stores the incident once; a second delivery of the same event is reported, not stored twice. */
    async saveIncident(incident: Incident, payload: unknown): Promise<{ created: boolean }> {
      const result = await db.query(
        `INSERT INTO incidents (id, source, source_id, title, culprit, flag, occurred_at, incident, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [incident.id, incident.source, incident.sourceId, incident.title, incident.culprit, incident.flag, incident.occurredAt, JSON.stringify(incident), JSON.stringify(payload)],
      );
      return { created: result.rows.length > 0 };
    },

    async getIncident(id: string): Promise<IncidentRow | null> {
      const { rows } = await db.query<{ incident: Incident; received_at: unknown }>(`SELECT incident, received_at FROM incidents WHERE id = $1`, [id]);
      const row = rows[0];
      return row ? { incident: row.incident, receivedAt: iso(row.received_at)! } : null;
    },

    async listIncidents(): Promise<IncidentRow[]> {
      const { rows } = await db.query<{ incident: Incident; received_at: unknown }>(`SELECT incident, received_at FROM incidents ORDER BY received_at DESC, id`);
      return rows.map((r) => ({ incident: r.incident, receivedAt: iso(r.received_at)! }));
    },

    async createRun(run: { id: string; incidentId: string; mode: RunRow["mode"] }): Promise<void> {
      await db.query(`INSERT INTO runs (id, incident_id, mode, status) VALUES ($1, $2, $3, 'queued')`, [run.id, run.incidentId, run.mode]);
    },

    async updateRun(id: string, patch: Partial<Pick<RunRow, "status" | "step" | "worktree" | "branch" | "summary">> & { finished?: boolean }): Promise<void> {
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      };
      if (patch.status !== undefined) set("status", patch.status);
      if (patch.step !== undefined) set("step", patch.step);
      if (patch.worktree !== undefined) set("worktree", patch.worktree);
      if (patch.branch !== undefined) set("branch", patch.branch);
      if (patch.summary !== undefined) set("summary", JSON.stringify(patch.summary));
      if (patch.finished) sets.push("finished_at = now()");
      if (sets.length === 0) return;
      await db.query(`UPDATE runs SET ${sets.join(", ")} WHERE id = $1`, params);
    },

    async getRun(id: string): Promise<RunRow | null> {
      const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM runs WHERE id = $1`, [id]);
      const r = rows[0];
      return r ? toRun(r) : null;
    },

    async listRuns(incidentId?: string): Promise<RunRow[]> {
      const { rows } = incidentId
        ? await db.query<Record<string, unknown>>(`SELECT * FROM runs WHERE incident_id = $1 ORDER BY started_at DESC`, [incidentId])
        : await db.query<Record<string, unknown>>(`SELECT * FROM runs ORDER BY started_at DESC`);
      return rows.map(toRun);
    },

    async appendEvent(event: Omit<RunEvent, "seq" | "at">): Promise<RunEvent> {
      const { rows } = await db.query<{ seq: number; at: unknown }>(
        `INSERT INTO run_events (run_id, seq, step, status, summary, data)
         VALUES ($1, (SELECT COALESCE(MAX(seq), 0) + 1 FROM run_events WHERE run_id = $1), $2, $3, $4, $5)
         RETURNING seq, at`,
        [event.runId, event.step, event.status, event.summary, JSON.stringify(event.data)],
      );
      return { ...event, seq: rows[0]!.seq, at: iso(rows[0]!.at)! };
    },

    async listEvents(runId: string): Promise<RunEvent[]> {
      const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM run_events WHERE run_id = $1 ORDER BY seq`, [runId]);
      return rows.map((r) => ({
        runId: r["run_id"] as string,
        seq: r["seq"] as number,
        step: r["step"] as string,
        status: r["status"] as EventStatus,
        at: iso(r["at"])!,
        summary: r["summary"] as string,
        data: r["data"] as Record<string, unknown>,
      }));
    },
  };
}

export type Store = ReturnType<typeof makeStore>;

function toRun(r: Record<string, unknown>): RunRow {
  return {
    id: r["id"] as string,
    incidentId: r["incident_id"] as string,
    mode: r["mode"] as RunRow["mode"],
    status: r["status"] as RunStatus,
    step: (r["step"] as string | null) ?? null,
    startedAt: iso(r["started_at"])!,
    finishedAt: iso(r["finished_at"]),
    worktree: (r["worktree"] as string | null) ?? null,
    branch: (r["branch"] as string | null) ?? null,
    summary: (r["summary"] as Record<string, unknown>) ?? {},
  };
}
