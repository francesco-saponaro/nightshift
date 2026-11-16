import type { Incident } from "@agent/incident.js";
import type { IncidentRow, RunEvent, RunRow } from "@agent/store.js";

/** What the dashboard reads: the agent's read API, or the recorded runs in demo mode. Same shapes either way. */
export type { Incident, RunEvent, RunRow };

export interface IncidentWithRuns extends IncidentRow {
  runs: RunRow[];
}

export interface RunWithEvents {
  run: RunRow;
  events: RunEvent[];
}

export interface Health {
  ok: boolean;
  mode: "dry-run" | "live";
  integrations: { sentry: boolean; posthog: boolean; agent: boolean; sandbox: boolean };
  pullRequests: { label: string; autoMerge: boolean } | null;
  /** True when the dashboard is showing the recorded runs instead of a server. */
  demo: boolean;
}

export interface SkillDoc {
  name: string;
  file: string;
  purpose: string;
  when: string;
  gate: boolean;
  body: string;
}

export interface DashboardApi {
  listIncidents(): Promise<IncidentWithRuns[]>;
  getIncident(id: string): Promise<IncidentWithRuns | null>;
  getRun(id: string): Promise<RunWithEvents | null>;
  health(): Promise<Health>;
  skills(): Promise<{ skills: SkillDoc[] }>;
}
