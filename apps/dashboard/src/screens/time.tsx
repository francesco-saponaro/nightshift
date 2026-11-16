import type { IncidentWithRuns, RunWithEvents } from "../api/types.js";
import { useRuns } from "../hooks.js";
import { STEP_LABELS, elapsed, stepsOf, type Step } from "../timeline.js";

/**
 * Where a run's minutes go: one bar per run on one scale, split by step. The verification is the one in the hue because
 * it is the part a person would otherwise do by hand; the agent's own turns are grey, and in a dry run they are short
 * because they are replayed.
 */
const SEGMENTS: { step: Step; fill: string }[] = [
  { step: "worktree", fill: "var(--color-control)" },
  { step: "reproduce", fill: "#8a8a8a" },
  { step: "fix", fill: "#5f6670" },
  { step: "verify", fill: "var(--color-hue)" },
  { step: "review", fill: "#8a8a8a" },
  { step: "simple", fill: "#5f6670" },
];

/** What each fixed run left behind and what a person does with it: the branch, or the pull request. */
export function TheBranches({ rows }: { rows: IncidentWithRuns[] }) {
  const fixed = rows.filter((r) => r.runs[0]?.status === "fixed");
  return (
    <section className="panel" aria-label="The branches">
      <h2 className="text-base font-medium">The branches</h2>
      <p className="text-muted px-5 pt-1 text-[13px]">{fixed.length ? "Each fix on a branch of its own, from the commit the run started at." : "A fixed run leaves its branch here."}</p>
      <div className="pt-2">
        {fixed.length ? (
          <table className="data" aria-label="Branches">
            <tbody>
              {fixed.map((row) => {
                const run = row.runs[0]!;
                const pr = run.summary["pullRequest"] as { url: string | null; number: number | null; autoMerge: string } | undefined;
                return (
                  <tr key={row.incident.id}>
                    <td className="mono">{run.branch ?? "—"}</td>
                    <td className="text-muted whitespace-nowrap">{(run.summary["files"] as string[] | undefined)?.length ?? 0} files</td>
                    <td className="text-right whitespace-nowrap">
                      {pr?.url ? (
                        <a className="underline" href={pr.url} target="_blank" rel="noreferrer">
                          Pull request #{pr.number}
                        </a>
                      ) : (
                        <span className="text-muted">ready for a pull request</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="empty mx-5 mb-4">Nothing fixed yet.</p>
        )}
      </div>
    </section>
  );
}

export function WhereTheTimeGoes({ rows }: { rows: IncidentWithRuns[] }) {
  const ids = rows.map((r) => r.runs[0]?.id).filter((id): id is string => Boolean(id));
  const runs = useRuns(ids);
  const loaded = runs.filter((r): r is RunWithEvents => r !== null);
  if (rows.length === 0) return null;
  const bars = loaded.map((run) => {
    const steps = stepsOf(run.events);
    const parts = SEGMENTS.map((seg) => ({ ...seg, ms: steps.find((s) => s.step === seg.step)?.durationMs ?? 0 }));
    const stepped = parts.reduce((n, p) => n + p.ms, 0);
    const total = run.run.finishedAt ? Date.parse(run.run.finishedAt) - Date.parse(run.run.startedAt) : stepped;
    return { id: run.run.incidentId, parts, total, stepped, mode: run.run.mode };
  });
  const longest = Math.max(1, ...bars.map((b) => b.total));
  const verifyShare = bars.length ? Math.round((bars.reduce((n, b) => n + (b.parts.find((p) => p.step === "verify")?.ms ?? 0), 0) / Math.max(1, bars.reduce((n, b) => n + b.total, 0))) * 100) : 0;
  // The segments are the steps; what is left of the run's total (the prompt, the record, the clean-up) stays unfilled.
  const dry = bars.some((b) => b.mode === "dry-run");
  return (
    <section className="panel" aria-label="Where the time goes">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-base font-medium">Where the time goes</h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" aria-label="Steps">
          {SEGMENTS.map((seg) => (
            <li key={seg.step} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-[2px]" style={{ background: seg.fill }} aria-hidden="true" />
              <span className="text-muted">{STEP_LABELS[seg.step]}</span>
            </li>
          ))}
        </ul>
      </header>
      <p className="text-muted px-5 pt-1 text-[13px]">
        Verification is {verifyShare}% of the night's run time{dry ? "; the agent's turns are replayed in a dry run, so a live run spends longer in reproduction and fix." : "."}
      </p>
      <div className="px-5 pt-3 pb-5">
        {loaded.length === 0 ? (
          <p className="empty">Reading the runs…</p>
        ) : (
          <table className="w-full" aria-label="Run time by step">
            <tbody>
              {bars.map((bar) => (
                <tr key={bar.id}>
                  <td className="mono w-32 py-2 pr-4 align-middle">{bar.id}</td>
                  <td className="py-2 align-middle">
                    <div className="flex h-5 gap-[2px]" style={{ width: `${(bar.total / longest) * 100}%` }} role="img" aria-label={bar.parts.map((p) => `${STEP_LABELS[p.step]} ${elapsed(p.ms)}`).join(", ")}>
                      {bar.parts.map((p) =>
                        p.ms > 0 ? <div key={p.step} className="h-full rounded-[2px]" style={{ flex: `${p.ms} 0 0`, background: p.fill }} title={`${STEP_LABELS[p.step]}: ${elapsed(p.ms)}`} /> : null,
                      )}
                      {bar.total > bar.stepped ? <div className="h-full" style={{ flex: `${bar.total - bar.stepped} 0 0` }} aria-hidden="true" /> : null}
                    </div>
                  </td>
                  <td className="num w-20 py-2 pl-4 text-right align-middle">{elapsed(bar.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
