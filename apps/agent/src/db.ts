import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

/**
 * One small interface over the two databases Nightshift runs on: PGlite (in memory for tests and the dry run, on disk
 * for a laptop) and PostgreSQL. Both speak the same SQL; only the driver differs. pg-boss sits on the same connection.
 */
export interface Db {
  kind: "pglite" | "postgres";
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Several statements at once, with no parameters, as a migration or pg-boss needs. Returns every statement's rows. */
  exec(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
  connectionString?: string;
}

export async function openDb(url?: string): Promise<Db> {
  if (url && url.startsWith("postgres")) {
    const pool = new pg.Pool({ connectionString: url });
    return {
      kind: "postgres",
      connectionString: url,
      query: async (sql, params = []) => {
        const result = await pool.query(sql, params);
        return { rows: result.rows };
      },
      exec: async (sql) => {
        const result = await pool.query(sql);
        const results = Array.isArray(result) ? result : [result];
        return { rows: results.flatMap((r) => r.rows) };
      },
      close: () => pool.end(),
    };
  }
  const dir = url && url.startsWith("pglite:") ? url.slice("pglite:".length) : "";
  const db = dir ? new PGlite(dir) : new PGlite();
  return {
    kind: "pglite",
    query: async (sql, params = []) => {
      const result = await db.query(sql, params);
      return { rows: result.rows as never[] };
    },
    exec: async (sql) => {
      const results = await db.exec(sql);
      return { rows: results.flatMap((r) => r.rows as Record<string, unknown>[]) };
    },
    close: () => db.close(),
  };
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS incidents (
  id text PRIMARY KEY,
  source text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  culprit text NOT NULL,
  flag text,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  incident jsonb NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES incidents (id),
  mode text NOT NULL,
  status text NOT NULL,
  step text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  worktree text,
  branch text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS runs_incident ON runs (incident_id, started_at);
CREATE TABLE IF NOT EXISTS run_events (
  run_id text NOT NULL REFERENCES runs (id),
  seq integer NOT NULL,
  step text NOT NULL,
  status text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id, seq)
);
`;

export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA);
}
