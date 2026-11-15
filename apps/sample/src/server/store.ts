import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

export interface TodoRow {
  id: string;
  title: string;
  dueOn: string | null;
  done: boolean;
  clientKey: string | null;
  createdAt: string;
}

export interface NewTodo {
  title: string;
  dueOn?: string | null | undefined;
  clientKey?: string | null | undefined;
}

export interface TodoPatch {
  title?: string | undefined;
  dueOn?: string | null | undefined;
  done?: boolean | undefined;
}

export interface Store {
  insert(input: NewTodo, bugs?: ReadonlySet<string>): Promise<{ todo: TodoRow; created: boolean }>;
  list(): Promise<TodoRow[]>;
  get(id: string): Promise<TodoRow | null>;
  update(id: string, patch: TodoPatch): Promise<TodoRow | null>;
  remove(id: string): Promise<boolean>;
  close(): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS todos (
  id text PRIMARY KEY,
  title text NOT NULL CONSTRAINT todos_title_not_blank CHECK (btrim(title) <> ''),
  due_on date,
  done boolean NOT NULL DEFAULT false,
  client_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS todos_client_key ON todos (client_key) WHERE client_key IS NOT NULL;
`;

const ROUND_TRIP_MS = 5;

const COLUMNS = `id, title, to_char(due_on, 'YYYY-MM-DD') AS due_on, done, client_key, created_at`;

interface RawRow {
  id: string;
  title: string;
  due_on: string | null;
  done: boolean;
  client_key: string | null;
  created_at: Date | string;
}

function toRow(raw: RawRow): TodoRow {
  return {
    id: raw.id,
    title: raw.title,
    dueOn: raw.due_on,
    done: raw.done,
    clientKey: raw.client_key,
    createdAt: new Date(raw.created_at).toISOString(),
  };
}

/**
 * Opens the store. No url, or "pglite": PGlite in memory. "pglite:<dir>": PGlite on disk in that folder.
 * A real PostgreSQL would take a driver this app does not carry; it is a sample, not a product.
 */
export async function openStore(url?: string): Promise<Store> {
  const db = url && url.startsWith("pglite:") && url.length > "pglite:".length ? new PGlite(url.slice("pglite:".length)) : new PGlite();
  await db.exec(SCHEMA);

  // PGlite answers from inside WebAssembly without leaving the current tick; a real database answers over a socket a
  // few milliseconds later. The short wait before each query makes concurrent requests interleave here the way they
  // do in production, which is what makes the double-submit race reachable at all.
  async function query<T>(sql: string, params: unknown[] = []) {
    await sleep(ROUND_TRIP_MS);
    return db.query<T>(sql, params);
  }

  async function one(sql: string, params: unknown[]): Promise<TodoRow | null> {
    const result = await query<RawRow>(sql, params);
    const row = result.rows[0];
    return row ? toRow(row) : null;
  }

  return {
    async insert(input, bugs = new Set()) {
      const id = randomUUID();
      const params = [id, input.title, input.dueOn ?? null, input.clientKey ?? null];
      if (input.clientKey && bugs.has("double-submit")) {
        // Check, then insert. Two requests with the same key at the same time both pass the check.
        const existing = await one(`SELECT ${COLUMNS} FROM todos WHERE client_key = $1`, [input.clientKey]);
        if (existing) return { todo: existing, created: false };
        const todo = await one(`INSERT INTO todos (id, title, due_on, client_key) VALUES ($1, $2, $3::date, $4) RETURNING ${COLUMNS}`, params);
        return { todo: todo!, created: true };
      }
      const inserted = await one(
        `INSERT INTO todos (id, title, due_on, client_key) VALUES ($1, $2, $3::date, $4)
         ON CONFLICT (client_key) WHERE client_key IS NOT NULL DO NOTHING RETURNING ${COLUMNS}`,
        params,
      );
      if (inserted) return { todo: inserted, created: true };
      const existing = await one(`SELECT ${COLUMNS} FROM todos WHERE client_key = $1`, [input.clientKey]);
      if (!existing) throw new Error("insert returned nothing and no row carries the client key");
      return { todo: existing, created: false };
    },

    async list() {
      const result = await query<RawRow>(`SELECT ${COLUMNS} FROM todos ORDER BY created_at, id`);
      return result.rows.map(toRow);
    },

    async get(id) {
      return one(`SELECT ${COLUMNS} FROM todos WHERE id = $1`, [id]);
    },

    async update(id, patch) {
      const current = await one(`SELECT ${COLUMNS} FROM todos WHERE id = $1`, [id]);
      if (!current) return null;
      const title = patch.title ?? current.title;
      const dueOn = patch.dueOn === undefined ? current.dueOn : patch.dueOn;
      const done = patch.done ?? current.done;
      return one(`UPDATE todos SET title = $2, due_on = $3::date, done = $4 WHERE id = $1 RETURNING ${COLUMNS}`, [id, title, dueOn, done]);
    },

    async remove(id) {
      const result = await query(`DELETE FROM todos WHERE id = $1`, [id]);
      return (result.affectedRows ?? 0) > 0;
    },

    async close() {
      await db.close();
    },
  };
}
