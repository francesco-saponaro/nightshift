import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { IncidentWithRuns, RunRow } from "../api/types.js";
import { Pill, runState } from "../components/pill.js";
import { RunStrip } from "../components/run-strip.js";
import { useRunSteps } from "../hooks.js";
import { elapsed } from "../timeline.js";

/**
 * The night at a glance: every incident the trackers sent, what the run did with it, and whether a person is needed.
 * The question is "did the night shift fix what came in?", so the finding is the first line and the run strip is the
 * column the eye lands on.
 */
export function finding(rows: IncidentWithRuns[]): string {
  if (rows.length === 0) return "No incident has come in yet; the webhooks are listening.";
  const latest = rows.map((r) => r.runs[0]);
  const fixed = latest.filter((r) => r?.status === "fixed").length;
  const waiting = latest.filter((r) => r?.status === "failed").length;
  const running = latest.filter((r) => r?.status === "running" || r?.status === "queued").length;
  const opened = latest.filter((r) => (r?.summary["pullRequest"] as { url?: string | null } | undefined)?.url).length;
  const parts = [`${rows.length} ${rows.length === 1 ? "incident" : "incidents"}`, `${fixed} fixed by the night shift`, `${waiting} waiting for a person`];
  if (running) parts.push(`${running} still running`);
  const prs = opened ? `${opened} ${opened === 1 ? "pull request" : "pull requests"} opened.` : fixed ? "no pull request opened, NIGHTSHIFT_OPEN_PR is off." : "";
  return `${parts.join(", ")}${prs ? `; ${prs}` : "."}`;
}

const SOURCE: Record<string, string> = { sentry: "Sentry", posthog: "PostHog" };

const FILTERS = [
  { key: "all", label: "All", keep: () => true },
  { key: "fixed", label: "Fixed", keep: (r: RunRow | undefined) => r?.status === "fixed" },
  { key: "waiting", label: "Needs a person", keep: (r: RunRow | undefined) => r?.status === "failed" },
  { key: "running", label: "Running", keep: (r: RunRow | undefined) => r?.status === "running" || r?.status === "queued" },
] as const;

export function IncidentsTable({ rows }: { rows: IncidentWithRuns[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const keep = FILTERS.find((f) => f.key === filter)!.keep;
  const shown = rows.filter((r) => keep(r.runs[0]));
  return (
    <section aria-label="Incidents">
      <div className="flex items-end justify-between gap-4">
        <div className="tabs" role="tablist" aria-label="Filter incidents">
          {FILTERS.map((f) => {
            const n = rows.filter((r) => f.keep(r.runs[0])).length;
            return (
              <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label} <span className="num">{n}</span>
              </button>
            );
          })}
        </div>
        <p className="text-muted hidden whitespace-nowrap pb-2 sm:block">
          <span className="num">{shown.length}</span> of <span className="num">{rows.length}</span>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="empty mt-4">No incident has come in yet. Point the tracker at the webhook and switch a seeded bug on in the sample app.</p>
      ) : shown.length === 0 ? (
        <p className="empty mt-4">Nothing in this state.</p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3 sm:hidden" aria-label="Incidents, one per card">
            {shown.map((row) => (
              <IncidentCard key={row.incident.id} row={row} />
            ))}
          </ul>
          <div className="panel mt-4 hidden overflow-x-auto sm:block">
            <table className="data">
            <thead>
              <tr>
                <th>Incident</th>
                <th>Where</th>
                <th>Source</th>
                <th>Flag</th>
                <th style={{ width: 160 }}>Run</th>
                <th className="num">Diff</th>
                <th>Result</th>
                <th className="num">Reported</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <IncidentRow key={row.incident.id} row={row} />
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </section>
  );
}

const took = (run: RunRow | undefined) => (run?.finishedAt ? elapsed(Date.parse(run.finishedAt) - Date.parse(run.startedAt)) : run ? "running" : "—");

function IncidentRow({ row }: { row: IncidentWithRuns }) {
  const run = row.runs[0];
  const steps = useRunSteps(run?.id);
  const state = runState(run);
  const counts = run?.summary["counts"] as { files: number; added: number; removed: number } | undefined;
  return (
    <tr>
      <td>
        <Link to="/incidents/$id" params={{ id: row.incident.id }} className="mono font-medium no-underline hover:underline">
          {row.incident.id}
        </Link>
        <div className="text-muted max-w-[32ch] truncate text-[13px]" title={row.incident.title}>
          {row.incident.title}
        </div>
      </td>
      <td className="mono whitespace-nowrap">{row.incident.culprit}</td>
      <td>{SOURCE[row.incident.source] ?? row.incident.source}</td>
      <td className="mono">{row.incident.flag ?? "—"}</td>
      <td className="pt-[18px]">{steps ? <RunStrip steps={steps} /> : <div className="strip" aria-hidden="true" />}</td>
      <td className="num mono whitespace-nowrap">{counts ? `+${counts.added} −${counts.removed}` : "—"}</td>
      <td>
        <Pill tone={state.tone}>{state.label}</Pill>
      </td>
      <td className="num text-muted whitespace-nowrap">{row.receivedAt.slice(0, 16).replace("T", " ")}</td>
    </tr>
  );
}

/** The same row as a two-line card, for a phone. */
function IncidentCard({ row }: { row: IncidentWithRuns }) {
  const run = row.runs[0];
  const steps = useRunSteps(run?.id);
  const state = runState(run);
  const counts = run?.summary["counts"] as { files: number; added: number; removed: number } | undefined;
  return (
    <li className="panel px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <Link to="/incidents/$id" params={{ id: row.incident.id }} className="mono font-medium no-underline">
          {row.incident.id}
        </Link>
        <Pill tone={state.tone}>{state.label}</Pill>
      </div>
      <p className="text-muted mt-1 truncate text-[13px]" title={row.incident.title}>
        {row.incident.title}
      </p>
      <p className="text-muted mt-1 text-[13px]">
        <span className="mono">{row.incident.culprit}</span> · {SOURCE[row.incident.source] ?? row.incident.source} · <span className="mono">{row.incident.flag ?? "no flag"}</span> · {counts ? `+${counts.added} −${counts.removed}` : "no diff"} · {took(run)}
      </p>
      <div className="mt-3">{steps ? <RunStrip steps={steps} /> : null}</div>
    </li>
  );
}
