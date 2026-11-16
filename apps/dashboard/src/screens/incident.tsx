import { Link } from "@tanstack/react-router";
import type { IncidentWithRuns, RunEvent, RunWithEvents } from "../api/types.js";
import { Markdown } from "../components/markdown.js";
import { Pill, runState } from "../components/pill.js";
import { RunStrip, stepLabel } from "../components/run-strip.js";
import { STEP_LABELS, elapsed, stepsOf, verificationOf, type Step } from "../timeline.js";

/**
 * One incident, from the error to the pull request. The question is "what did the run do, and can the pull request be
 * merged?", so the strip comes first with the outcome in one sentence, then the record in the order it happened:
 * the error, the reproduction and its failing output, the agent's transcript, the verification table, the two
 * verdicts, the pull request. The facts of the incident sit in the right rail.
 */
const SOURCE: Record<string, string> = { sentry: "Sentry", posthog: "PostHog" };
const PHASES: Step[] = ["reproduce", "fix", "review", "simple"];

export function IncidentDetail({ row, run }: { row: IncidentWithRuns; run: RunWithEvents | null }) {
  const { incident } = row;
  const events = run?.events ?? [];
  const steps = stepsOf(events);
  const state = runState(run?.run);
  const counts = run?.run.summary["counts"] as { files: number; added: number; removed: number; newFiles: number } | undefined;
  const files = (run?.run.summary["files"] as string[] | undefined) ?? [];
  const pr = run?.run.summary["pullRequest"] as { title: string; url: string | null; number: number | null; autoMerge: string } | undefined;
  const prEvent = events.filter((e) => e.step === "pr").at(-1);
  const failed = run?.run.status === "failed" ? (run.run.summary as { failedStep?: string; reason?: string }) : null;
  const reproduce = events.find((e) => e.step === "reproduce" && (e.status === "ok" || e.status === "failed"));
  const verification = verificationOf(events);
  const longest = Math.max(1, ...verification.map((c) => c.durationMs));
  const total = run?.run.finishedAt ? Date.parse(run.run.finishedAt) - Date.parse(run.run.startedAt) : null;

  const outcome = !run
    ? "No run has started for this incident."
    : run.run.status === "fixed"
      ? `Fixed in ${elapsed(total ?? 0)}: ${counts?.files ?? 0} files, +${counts?.added ?? 0} −${counts?.removed ?? 0}; ${pr?.url ? `pull request #${pr.number} opened${pr.autoMerge === "queued" ? ", merging itself when the checks are green" : ""}.` : "pull request not opened, NIGHTSHIFT_OPEN_PR is off; the branch holds the fix."}`
      : run.run.status === "failed"
        ? `Stopped at ${STEP_LABELS[(failed?.failedStep as Step) ?? "worktree"] ?? failed?.failedStep} after ${elapsed(total ?? 0)}: ${failed?.reason ?? "no reason recorded"}. A person takes over.`
        : `Running: ${STEP_LABELS[(run.run.step as Step) ?? "worktree"] ?? run.run.step}.`;

  return (
    <article>
      <p className="text-muted mb-2">
        <Link to="/" className="no-underline hover:underline">
          Incidents
        </Link>
      </p>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mono text-[24px] leading-8 font-medium">{incident.id}</h1>
          <p className="mt-1 font-medium">{incident.title}</p>
          <p className="mt-1">{outcome}</p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Pill tone={state.tone}>{state.label}</Pill>
          {pr?.url ? (
            <a className="button primary" href={pr.url} target="_blank" rel="noreferrer">
              Open pull request #{pr.number}
            </a>
          ) : null}
        </div>
      </header>

      {/* One column, 1360 wide at 1440; the facts sit in three columns of 437 (3 × 437 + 2 × 24 = 1359, the last column takes the odd pixel). */}
      <div className="mt-6 flex min-w-0 flex-col gap-6">
          <section className="panel" aria-label="The run">
            <h2 className="text-base font-medium">The run</h2>
            <div className="px-5 pt-3 pb-5">
              {run ? <RunStrip steps={steps} large /> : <p className="empty">Nothing has run.</p>}
              <ol className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-5 lg:grid-cols-9">
                {steps.map((s) => (
                  <li key={s.step} className={s.status === "skipped" ? "text-muted" : ""} title={stepLabel(s)}>
                    {STEP_LABELS[s.step]}
                    <div className="text-muted num">{s.status === "ok" || s.status === "failed" ? elapsed(s.durationMs) : s.status === "off" ? "off" : s.status === "running" ? "running" : "—"}</div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="panel" aria-label="The error">
            <h2 className="text-base font-medium">The error</h2>
            <div className="px-5 pt-3 pb-5">
              <p className="font-medium">{incident.message || incident.title}</p>
              <p className="mt-2">
                {SOURCE[incident.source] ?? incident.source} reported <span className="mono">{incident.errorType}</span> on <span className="mono">{incident.culprit}</span> at {incident.occurredAt.replace("T", " ").slice(0, 19)} UTC
                {incident.flag ? (
                  <>
                    , with the flag <span className="mono">{incident.flag}</span> on
                  </>
                ) : null}
                .
              </p>
              {incident.request?.body !== undefined ? (
                <p className="mt-2">
                  The request body was <code>{JSON.stringify(incident.request.body)}</code>.
                </p>
              ) : null}
              <pre className="mt-3">{incident.stack || "(no stack recorded)"}</pre>
            </div>
          </section>

          <section className="panel" aria-label="Facts">
            <h2 className="text-base font-medium">Facts</h2>
            <div className="grid gap-x-6 px-5 pt-3 pb-5 md:grid-cols-3">
              <dl className="facts">
                <dt>Source</dt>
                <dd>{SOURCE[incident.source] ?? incident.source}</dd>
                <dt>Tracker id</dt>
                <dd className="mono">{incident.sourceId}</dd>
                <dt>Where</dt>
                <dd className="mono">{incident.culprit}</dd>
                <dt>Flag</dt>
                <dd className="mono">{incident.flag ?? "—"}</dd>
                <dt>Release</dt>
                <dd className="mono">{incident.release ?? "—"}</dd>
                <dt>Environment</dt>
                <dd>{incident.environment ?? "—"}</dd>
                <dt>Happened</dt>
                <dd className="num">{incident.occurredAt.replace("T", " ").slice(0, 19)} UTC</dd>
                <dt>Received</dt>
                <dd className="num">{row.receivedAt.replace("T", " ").slice(0, 19)} UTC</dd>
              </dl>
              {run ? (
                <dl className="facts">
                  <dt>Run</dt>
                  <dd className="mono">{run.run.id.slice(0, 8)}</dd>
                  <dt>Mode</dt>
                  <dd>{run.run.mode === "dry-run" ? "Dry run" : "Live"}</dd>
                  <dt>Agent</dt>
                  <dd className="mono">{String(run.run.summary["agent"] ?? events[0]?.data["agent"] ?? "—")}</dd>
                  <dt>Branch</dt>
                  <dd className="mono">{run.run.branch ?? "—"}</dd>
                  <dt>Started</dt>
                  <dd className="num">{run.run.startedAt.replace("T", " ").slice(0, 19)} UTC</dd>
                  <dt>Took</dt>
                  <dd className="num">{total === null ? "still running" : elapsed(total)}</dd>
                  <dt>Diff</dt>
                  <dd className="num">{counts ? `${counts.files} files, +${counts.added} −${counts.removed}, ${counts.newFiles} new` : "—"}</dd>
                  <dt>Pull request</dt>
                  <dd>{pr?.url ? `#${pr.number}` : "not opened"}</dd>
                </dl>
              ) : (
                <p className="empty self-start">No run.</p>
              )}
              <div>
                <p className="text-muted py-1.5">Files changed</p>
                {files.length ? (
                  <ul className="mono text-[12px] leading-5">
                    {files.map((f) => (
                      <li key={f} className="break-all">
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">None yet.</p>
                )}
              </div>
            </div>
          </section>

          <section className="panel" aria-label="The reproduction">
            <h2 className="text-base font-medium">The reproduction</h2>
            <div className="px-5 pt-3 pb-5">
              {reproduce ? (
                <>
                  <p>
                    <code>apps/sample/test/incident-{incident.id}.test.ts</code>, run with <code>SAMPLE_BUGS={incident.flag ?? ""}</code>: {reproduce.summary}.
                  </p>
                  <pre className="mt-3">{tailOf(String(reproduce.data["output"] ?? ""), 30)}</pre>
                </>
              ) : (
                <p className="empty">The reproduction has not run.</p>
              )}
            </div>
          </section>

          <section className="panel" aria-label="The agent's transcript">
            <h2 className="text-base font-medium">The agent's transcript</h2>
            <div className="px-5 pt-3 pb-5">
              <p className="text-muted mb-2">
                {run?.run.mode === "dry-run" ? "A dry run: the agent's turns were replayed from a recorded transcript and its edits applied as patches. " : "A live run. "}
                Keys, tokens, cookies and addresses are redacted before anything is stored.
              </p>
              {PHASES.map((phase) => (
                <Transcript key={phase} phase={phase} events={events.filter((e) => e.step === phase && e.status === "info" && e.data["role"] !== undefined)} />
              ))}
              {events.every((e) => e.data["role"] === undefined) ? <p className="empty">The agent has not been asked anything yet.</p> : null}
            </div>
          </section>

          <section className="panel" aria-label="Verification">
            <h2 className="text-base font-medium">Verification</h2>
            <div className="pt-1 pb-2">
              {verification.length ? (
                <table className="data" aria-label="Verification commands">
                  <thead>
                    <tr>
                      <th>Command</th>
                      <th>Result</th>
                      <th className="num">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verification.map((c) => (
                      <tr key={c.command}>
                        <td className="mono">{c.command}</td>
                        <td>{c.code === 0 ? "passed" : `exited ${c.code}`}</td>
                        <td className="num w-40">
                          {elapsed(c.durationMs)}
                          <div className="bar" data-top={c.durationMs === longest} style={{ width: `${Math.max(4, Math.round((c.durationMs / longest) * 100))}%`, marginLeft: "auto" }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty mx-5 mb-3">The verification has not run.</p>
              )}
            </div>
          </section>

          <section className="panel" aria-label="The gates">
            <h2 className="text-base font-medium">The gates</h2>
            <div className="px-5 pt-3 pb-5 grid gap-5 sm:grid-cols-2">
              <Gate name="Review" skill="review.md" events={events} step="review" />
              <Gate name="Simplicity" skill="simple.md" events={events} step="simple" />
            </div>
          </section>

          <section className="panel" aria-label="The pull request">
            <h2 className="text-base font-medium">The pull request</h2>
            <div className="px-5 pt-3 pb-5">
              {prEvent ? (
                <>
                  <p>
                    {pr?.url ? (
                      <>
                        Opened as{" "}
                        <a className="underline" href={pr.url} target="_blank" rel="noreferrer">
                          #{pr.number}
                        </a>
                        {pr.autoMerge === "queued" ? ", merging itself when the checks are green." : "; a person merges it."}
                      </>
                    ) : (
                      <>Not opened: {prEvent.summary.replace(/^not opened: /, "")}. The body below is what the run wrote.</>
                    )}
                  </p>
                  <h3 className="mt-4 font-medium">{String(prEvent.data["title"] ?? "")}</h3>
                  <div className="mt-2">
                    <Markdown text={plain(String(prEvent.data["body"] ?? ""))} />
                  </div>
                </>
              ) : (
                <p className="empty">The run did not reach the pull request.</p>
              )}
            </div>
          </section>
      </div>
    </article>
  );
}

function tailOf(text: string, lines: number): string {
  const all = plain(text).trimEnd().split("\n");
  return all.length > lines ? `…\n${all.slice(-lines).join("\n")}` : all.join("\n");
}

/** The test runner's glyphs as words, so the record reads the same in every font. */
export function plain(text: string): string {
  return text.replace(/\u276f/g, ">").replace(/\u2713/g, "pass").replace(/\u00d7/g, "fail").replace(/\u2192/g, "->");
}

function Transcript({ phase, events }: { phase: Step; events: RunEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="font-medium">{STEP_LABELS[phase]}</h3>
      <div className="mt-1">
        {events.map((e) => {
          const role = String(e.data["role"]);
          const tool = e.data["tool"] as { name: string; input: string } | undefined;
          const text = plain(String(e.data["text"] ?? ""));
          return (
            <div className="turn" key={e.seq}>
              <div className="who">{tool ? "tool call" : role === "tool" ? "tool result" : role}</div>
              <div className="what">
                {tool ? (
                  <>
                    <span className="mono font-medium">{tool.name}</span>
                    <details>
                      <summary>input</summary>
                      <pre className="mt-2">{plain(prettyInput(tool.input))}</pre>
                    </details>
                  </>
                ) : role === "tool" ? (
                  <pre>{plain(text)}</pre>
                ) : (
                  <p className="whitespace-pre-wrap">{plain(text)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function prettyInput(input: string): string {
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    return Object.entries(parsed)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n\n");
  } catch {
    return input;
  }
}

function Gate({ name, skill, events, step }: { name: string; skill: string; events: RunEvent[]; step: "review" | "simple" }) {
  const ended = events.find((e) => e.step === step && (e.status === "ok" || e.status === "failed"));
  const mechanical = events.find((e) => e.step === step && e.status === "info" && Array.isArray(e.data["findings"]));
  const verdictText = [...events].reverse().find((e) => e.step === step && e.data["role"] === "assistant" && /^(APPROVED|REFUSED|SIMPLE|NOT SIMPLE)/m.test(String(e.data["text"])));
  const lines = String(verdictText?.data["text"] ?? "").trim().split("\n");
  const findings = (mechanical?.data["findings"] as string[] | undefined) ?? [];
  return (
    <div>
      <h3 className="font-medium">
        {name} <span className="text-muted font-normal">· {skill}</span>
      </h3>
      {ended ? (
        <>
          <p className="mt-1">
            <span className={ended.status === "ok" ? "font-medium" : "text-negative font-medium"}>{plain(lines[0] ?? "")}</span>
          </p>
          {lines.length > 1 ? (
            <ul className="text-muted mt-1 list-disc pl-5 text-[13px]">
              {lines.slice(1).map((l) => (
                <li key={l}>{l.replace(/^[-*]\s*/, "")}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted mt-2 text-[13px]">Mechanical checks: {findings.length ? findings.join("; ") : "nothing found on the diff"}.</p>
        </>
      ) : (
        <p className="empty mt-1">Not reached.</p>
      )}
    </div>
  );
}
