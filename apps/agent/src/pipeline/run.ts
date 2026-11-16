import { SKILLS, loadSkills } from "@nightshift/skills";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redact } from "../agent/redact.js";
import type { AgentMessage, CodingAgent, Phase } from "../agent/types.js";
import type { Incident } from "../incident.js";
import type { RunEvent, Store } from "../store.js";
import { checkDiff, parseVerdict, type CheckResult, type Diff, type GateKind, type Verdict } from "./gates.js";
import { phaseInstruction, type PhaseContext } from "./phases.js";
import { openPullRequest, pullRequestBody, pullRequestTitle, type PullRequest, type PullRequestInput } from "./pr.js";
import { buildPrompt, reproPath } from "./prompt.js";
import { sh, type ShellResult } from "./shell.js";
import { createWorktree, diffOf, removeWorktree, type RepoLocation } from "./worktree.js";

/**
 * One incident, start to finish: a checkout of its own, the prompt, a failing reproduction, the fix, the verification,
 * the two gates, the pull request. Every step leaves an event on the run, so the dashboard shows what happened and in
 * what order, and a run that stops leaves the reason behind.
 */
export interface RunDeps {
  store: Store;
  agent: CodingAgent;
  mode: "dry-run" | "live";
  repo: RepoLocation;
  worktreesDir: string;
  /** How the worktree gets its node_modules; null skips it (the tests share the parent's). */
  install: string | null;
  /** The verification commands, with {flag} replaced; null means the default list. */
  verification?: string[] | null;
  /** Strings to scrub from everything recorded. */
  secrets?: string[];
  /** Keep the worktree after the run, for a person to look at. */
  keepWorktree?: boolean;
  /** Open a pull request from the branch; null or unset records the title and body and leaves the branch alone. */
  pullRequest?: PullRequestOptions | null;
  log?: (line: string) => void;
  runId?: string;
  /** Time limit per command, for runaway test suites. */
  commandTimeoutMs?: number;
}

export interface PullRequestOptions {
  label: string;
  autoMerge: boolean;
  author: { name: string; email: string };
  env?: Record<string, string>;
  /** The function that talks to git and gh; the tests put a stand-in here so nothing is pushed. */
  open?: typeof openPullRequest;
}

export interface RunOutcome {
  runId: string;
  status: "fixed" | "failed";
  /** The step that stopped the run, when it failed. */
  failedStep: string | null;
  reason: string | null;
  worktreeDir: string | null;
  branch: string | null;
  diff: Diff | null;
  counts: CheckResult["counts"] | null;
  pullRequest: PullRequest | null;
  events: RunEvent[];
}

export const DEFAULT_VERIFICATION = [
  "pnpm -C apps/sample test",
  "SAMPLE_BUGS={flag} pnpm -C apps/sample test:e2e",
  "pnpm -C apps/sample test:e2e",
  "pnpm -r typecheck",
  "pnpm lint",
];

class StepFailed extends Error {
  constructor(
    readonly step: string,
    message: string,
  ) {
    super(message);
  }
}

const tail = (text: string, max = 6000) => (text.length > max ? `…${text.slice(-max)}` : text);

export async function runIncident(incident: Incident, deps: RunDeps): Promise<RunOutcome> {
  const runId = deps.runId ?? randomUUID();
  const secrets = deps.secrets ?? [];
  const scrub = (text: string) => redact(text, secrets);
  const log = deps.log ?? (() => {});
  const { store } = deps;
  const events: RunEvent[] = [];

  async function record(step: string, status: RunEvent["status"], summary: string, data: Record<string, unknown> = {}) {
    const event = await store.appendEvent({ runId, step, status, summary: scrub(summary), data: JSON.parse(scrub(JSON.stringify(data))) });
    events.push(event);
    log(`[${step}] ${status}: ${event.summary}`);
    return event;
  }

  const existing = await store.getRun(runId);
  if (!existing) await store.createRun({ id: runId, incidentId: incident.id, mode: deps.mode });
  await store.updateRun(runId, { status: "running", step: "received" });
  await record("received", "info", `${incident.source}: ${incident.title}`, { incidentId: incident.id, culprit: incident.culprit, flag: incident.flag, mode: deps.mode, agent: deps.agent.name });

  const worktreeDir = join(deps.worktreesDir, runId);
  const branch = `nightshift/${incident.id}`;
  const projectDir = deps.repo.projectDir;
  const cwd = projectDir ? join(worktreeDir, projectDir) : worktreeDir;
  const repro = reproPath(incident.id);
  const flagEnv = { SAMPLE_BUGS: incident.flag ?? "" };
  let diff: Diff | null = null;
  let counts: CheckResult["counts"] | null = null;
  let prompt = "";

  const run = async (command: string, env: Record<string, string> = {}): Promise<ShellResult> => {
    const result = await sh(command, cwd, { env, ...(deps.commandTimeoutMs ? { timeoutMs: deps.commandTimeoutMs } : {}) });
    return { ...result, output: scrub(result.output), stdout: scrub(result.stdout), stderr: scrub(result.stderr) };
  };

  const agentTurn = async (phase: Phase, ctx: PhaseContext) => {
    const full = `${prompt}\n${phaseInstruction(phase, ctx)}\n`;
    await record(phase, "started", `asking the agent (${deps.agent.name})`, { prompt: full });
    const turn = await deps.agent.turn({ phase, prompt: full, worktreeDir, projectDir });
    for (const m of turn.messages) await record(phase, "info", messageSummary(m), { role: m.role, text: tail(m.text, 4000), ...(m.tool ? { tool: m.tool } : {}) });
    return turn;
  };

  const reproduction = async (expectation: "fail" | "pass") => {
    const command = `pnpm -C apps/sample exec vitest run ${repro}`;
    const result = await run(command, flagEnv);
    const failed = result.code !== 0;
    const data = { command, env: flagEnv, code: result.code, output: tail(result.output), durationMs: result.durationMs };
    if (expectation === "fail") {
      if (!failed) throw new StepFailed("reproduce", "the reproduction passed on the unfixed code, so it does not reproduce the incident");
      // A crash, a missing file or a broken import also exit 1; only a test that ran and failed counts.
      if (!/Tests\s+\d+ failed/.test(result.output)) {
        await record("reproduce", "failed", "the reproduction did not run to a test failure", data);
        throw new StepFailed("reproduce", `the reproduction did not run to a test failure (exit ${result.code})`);
      }
      await record("reproduce", "ok", `the reproduction fails as it should (exit ${result.code})`, data);
    } else {
      if (failed) throw new StepFailed("fix", `the reproduction still fails after the fix (exit ${result.code})`);
      await record("fix", "ok", "the reproduction passes after the fix", data);
    }
    return result;
  };

  const verify = async () => {
    const commands = (deps.verification ?? DEFAULT_VERIFICATION).map((c) => c.replaceAll("{flag}", incident.flag ?? ""));
    await store.updateRun(runId, { step: "verify" });
    await record("verify", "started", `${commands.length} commands`, { commands });
    for (const command of commands) {
      const result = await run(command);
      const data = { command, code: result.code, output: tail(result.output), durationMs: result.durationMs };
      if (result.code !== 0) {
        await record("verify", "failed", `\`${command}\` exited ${result.code}`, data);
        throw new StepFailed("verify", `\`${command}\` exited ${result.code}`);
      }
      await record("verify", "info", `\`${command}\` passed in ${(result.durationMs / 1000).toFixed(1)}s`, data);
    }
    await record("verify", "ok", "every verification command passed");
  };

  const gate = async (kind: GateKind, attempt: number): Promise<{ check: CheckResult; verdict: Verdict }> => {
    await store.updateRun(runId, { step: kind });
    diff = await diffOf(worktreeDir);
    const fileLengths: Record<string, number> = {};
    for (const f of diff.files) {
      if (f.isDeleted) continue;
      fileLengths[f.path] = (await readFile(join(worktreeDir, f.path), "utf8")).split("\n").length - 1;
    }
    const check = checkDiff(diff, { incidentId: incident.id, flag: incident.flag, projectDir, fileLengths });
    counts = check.counts;
    const ownFindings = check.findings.filter((f) => f.startsWith(`${kind} `));
    await record(kind, "info", ownFindings.length ? `${ownFindings.length} mechanical findings` : "no mechanical findings", { findings: ownFindings, counts: check.counts, attempt });
    const turn = await agentTurn(kind, { reproPath: repro, flag: incident.flag, diff: diff.text, findings: ownFindings });
    const verdict = parseVerdict(kind, turn.text);
    const passed = verdict.passed && ownFindings.length === 0;
    await record(kind, passed ? "ok" : "failed", passed ? `${kind}: passed` : `${kind}: refused${verdict.rule ? ` on rule ${verdict.rule}` : ""} — ${verdict.reason ?? ownFindings[0]}`, { verdict, findings: ownFindings, attempt });
    return { check, verdict: { ...verdict, passed } };
  };

  try {
    // 1. A checkout of its own.
    await store.updateRun(runId, { step: "worktree", worktree: worktreeDir, branch });
    await record("worktree", "started", `git worktree add ${branch}`, { dir: worktreeDir, repoRoot: deps.repo.repoRoot, projectDir });
    const wt = await createWorktree({ repoRoot: deps.repo.repoRoot, dir: worktreeDir, branch });
    await writeSkills(cwd);
    if (deps.install) {
      const result = await run(deps.install);
      if (result.code !== 0) {
        await record("worktree", "failed", `install failed: \`${deps.install}\` exited ${result.code}`, { output: tail(result.output) });
        throw new StepFailed("worktree", `install failed (exit ${result.code})`);
      }
      await record("worktree", "info", `installed in ${(result.durationMs / 1000).toFixed(1)}s`, { command: deps.install, durationMs: result.durationMs });
    }
    await record("worktree", "ok", `checked out ${wt.base.slice(0, 10)} on ${branch}`, { base: wt.base, branch, skills: SKILLS.map((s) => s.name) });

    // 2. The prompt.
    await store.updateRun(runId, { step: "prompt" });
    prompt = await buildPrompt(incident);
    await record("prompt", "ok", `${prompt.split("\n").length} lines, three sections`, { prompt });

    // 3. A failing reproduction before anything else.
    await store.updateRun(runId, { step: "reproduce" });
    await agentTurn("reproduce", { reproPath: repro, flag: incident.flag });
    const reproResult = await reproduction("fail");

    // 4. The fix, proven by the same test.
    await store.updateRun(runId, { step: "fix" });
    await agentTurn("fix", { reproPath: repro, flag: incident.flag, reproOutput: tail(reproResult.output, 3000) });
    await reproduction("pass");

    // 5. Everything else still works.
    await verify();

    // 6. The gates, with one chance to rework.
    for (let attempt = 1; ; attempt++) {
      const review = await gate("review", attempt);
      const simple = review.verdict.passed ? await gate("simple", attempt) : null;
      if (review.verdict.passed && simple?.verdict.passed) break;
      const refused = review.verdict.passed ? simple! : review;
      const kind = review.verdict.passed ? "simple" : "review";
      if (attempt === 2) throw new StepFailed(kind, `refused twice; a person takes over: ${refused.verdict.reason ?? refused.check.findings.join("; ")}`);
      await store.updateRun(runId, { step: "rework" });
      await record("rework", "started", `${kind} refused once; the agent gets the findings back`, { findings: refused.check.findings, verdict: refused.verdict });
      const previous = [refused.verdict.reason ? `${kind}: ${refused.verdict.reason}` : "", ...refused.check.findings].filter(Boolean).join("\n");
      await agentTurn("fix", { reproPath: repro, flag: incident.flag, reproOutput: tail(reproResult.output, 3000), previous });
      await reproduction("pass");
      await verify();
    }

    // 7. The pull request, written from the run's own record.
    await store.updateRun(runId, { step: "pr" });
    const files = diff!.files.map((f) => f.path);
    const prInput: PullRequestInput = { incident, runId, mode: deps.mode, agentName: deps.agent.name, branch, base: wt.base, counts: counts!, files, events: [...events], autoMerge: deps.pullRequest?.autoMerge ?? false };
    const title = pullRequestTitle(incident);
    const body = pullRequestBody(prInput);
    let pr: PullRequest | null = null;
    if (deps.pullRequest) {
      const { label, author, env, open } = deps.pullRequest;
      await record("pr", "started", `gh pr create from ${branch}`, { title });
      try {
        pr = await (open ?? openPullRequest)(prInput, { worktreeDir, label, author, ...(env ? { env } : {}) });
      } catch (error) {
        throw new StepFailed("pr", error instanceof Error ? error.message : String(error));
      }
      await record("pr", "ok", `opened ${pr.url}${pr.autoMerge === "queued" ? "; it merges itself when the checks are green" : ""}`, { title, body, url: pr.url, number: pr.number, autoMerge: pr.autoMerge, commit: pr.commit, label });
    } else {
      await record("pr", "info", `not opened: NIGHTSHIFT_OPEN_PR is not set; ${branch} holds the fix and the body is on this event`, { title, body });
    }

    const summary = { counts, files, mode: deps.mode, agent: deps.agent.name, branch, worktree: worktreeDir, pullRequest: { title, url: pr?.url ?? null, number: pr?.number ?? null, autoMerge: pr?.autoMerge ?? "off" } };
    await store.updateRun(runId, { status: "fixed", step: "done", finished: true, summary });
    await record("done", "ok", `fixed: ${counts!.files} files, +${counts!.added} −${counts!.removed}; ${pr ? `pull request #${pr.number} opened` : `branch ${branch} is ready for a pull request`}`, summary);
    if (!deps.keepWorktree) await removeWorktree(deps.repo.repoRoot, worktreeDir);
    return { runId, status: "fixed", failedStep: null, reason: null, worktreeDir: deps.keepWorktree ? worktreeDir : null, branch, diff, counts, pullRequest: pr, events };
  } catch (error) {
    const step = error instanceof StepFailed ? error.step : ((await store.getRun(runId))?.step ?? "unknown");
    const reason = error instanceof Error ? error.message : String(error);
    await record(step, "failed", reason, { error: reason });
    await store.updateRun(runId, { status: "failed", finished: true, summary: { failedStep: step, reason: scrub(reason), mode: deps.mode, agent: deps.agent.name } });
    if (!deps.keepWorktree) await removeWorktree(deps.repo.repoRoot, worktreeDir).catch(() => {});
    return { runId, status: "failed", failedStep: step, reason: scrub(reason), worktreeDir: deps.keepWorktree ? worktreeDir : null, branch, diff, counts, pullRequest: null, events };
  }
}

/** The skills, on the agent's path as project skills so the SDK loads them and the agent can read them by name. */
async function writeSkills(projectCwd: string): Promise<void> {
  const skills = await loadSkills();
  for (const skill of skills) {
    const dir = join(projectCwd, ".claude", "skills", skill.name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), `---\nname: ${skill.name}\ndescription: ${skill.purpose}\n---\n\n${skill.body}`);
  }
}

function messageSummary(m: AgentMessage): string {
  if (m.role === "tool" && m.tool) return `${m.tool.name} ${tail(m.tool.input, 120)}`;
  if (m.role === "tool") return `tool result: ${tail(m.text.split("\n")[0] ?? "", 120)}`;
  const first = m.text.trim().split("\n")[0] ?? "";
  return `${m.role}: ${first.length > 140 ? `${first.slice(0, 140)}…` : first}`;
}
