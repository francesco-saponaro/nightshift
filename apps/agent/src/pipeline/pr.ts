import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Incident } from "../incident.js";
import type { RunEvent } from "../store.js";
import type { CheckResult, Verdict } from "./gates.js";
import { must, sh, type ShellOptions, type ShellResult } from "./shell.js";

/**
 * The last step: the branch becomes a pull request a person can read over coffee. The body is written from the
 * run's own events, so it says what happened rather than what the agent claims happened: the incident, the
 * reproduction and its failing output, the files changed, every verification command with its time, both verdicts,
 * and whatever the agent saw and left alone. Auto-merge is asked for only when the flag is on; it is off by default
 * and the human still reads the title.
 */
export interface PullRequestInput {
  incident: Incident;
  runId: string;
  mode: "dry-run" | "live";
  agentName: string;
  branch: string;
  /** The commit the worktree started from. */
  base: string;
  counts: CheckResult["counts"];
  files: string[];
  events: RunEvent[];
  autoMerge: boolean;
}

export interface PullRequestDeps {
  worktreeDir: string;
  label: string;
  author: { name: string; email: string };
  /** Extra environment for git and gh (a PATH with a stand-in gh in the tests, a GH_TOKEN in production). */
  env?: Record<string, string>;
  run?: (command: string, cwd: string, options?: ShellOptions) => Promise<ShellResult>;
}

export interface PullRequest {
  url: string;
  number: number;
  autoMerge: "queued" | "off";
  commit: string;
}

const TITLE_MAX = 100;

export function pullRequestTitle(incident: Incident): string {
  const title = `${incident.id}: ${incident.title.replace(/\s+/g, " ").trim()}`;
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

/** The lines under a "Seen, not touched" heading in the agent's messages: a second problem it noticed and left alone. */
export function seenNotTouched(text: string): string[] {
  const match = /^Seen, not touched:?\s*$/im.exec(text);
  if (!match) return [];
  const rest = text.slice(match.index + match[0].length).split("\n");
  const notes: string[] = [];
  for (const line of rest) {
    const item = /^\s*[-*]\s+(.+)$/.exec(line);
    if (item) notes.push(item[1]!.trim());
    else if (line.trim() === "" && notes.length === 0) continue;
    else break;
  }
  return notes;
}

/** The lines of a test run worth reading in a pull request: each failure, each assertion, and the totals. */
const testSummary = (text: unknown, max: number) => {
  const picked: string[] = [];
  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!/^(×|✓|FAIL\b|AssertionError|\w*Error:|Tests\s|Test Files\s)/.test(trimmed)) continue;
    if (!picked.includes(trimmed)) picked.push(trimmed);
  }
  return picked.slice(-max).join("\n");
};

export function pullRequestBody(input: PullRequestInput): string {
  const { incident, events } = input;
  const by = (step: string, status: RunEvent["status"]) => events.filter((e) => e.step === step && e.status === status);
  const reproPath = `apps/sample/test/incident-${incident.id}.test.ts`;
  const reproduce = by("reproduce", "ok")[0];
  const verifyRuns = by("verify", "info").filter((e) => typeof e.data["command"] === "string");
  const review = by("review", "ok").at(-1) ?? by("review", "failed").at(-1);
  const simple = by("simple", "ok").at(-1) ?? by("simple", "failed").at(-1);
  const verdictLine = (step: string, pattern: RegExp) => {
    const final = [...by(step, "info")].reverse().find((e) => e.data["role"] === "assistant" && pattern.test(String(e.data["text"])));
    return String(final?.data["text"] ?? "").trim();
  };
  const reviewText = verdictLine("review", /^(APPROVED|REFUSED)/m);
  const simpleText = verdictLine("simple", /^(SIMPLE|NOT SIMPLE)/m);
  const reviewVerdict = review?.data["verdict"] as Verdict | undefined;
  const simpleVerdict = simple?.data["verdict"] as Verdict | undefined;
  const findings = [...(review?.data["findings"] as string[] | undefined ?? []), ...(simple?.data["findings"] as string[] | undefined ?? [])];
  const notes = events.filter((e) => e.step === "fix" && e.data["role"] === "assistant").flatMap((e) => seenNotTouched(String(e.data["text"] ?? "")));
  const requestLine = incident.request ? `${incident.request.method} ${incident.request.url}` : "";
  const request = requestLine && requestLine !== incident.culprit ? `, \`${requestLine}\`` : "";
  const body = incident.request?.body !== undefined ? ` with body \`${JSON.stringify(incident.request.body)}\`` : "";
  const modeNote =
    input.mode === "dry-run"
      ? "This run was a dry run: the agent's turns were replayed from a recorded transcript and its edits applied as patches; the reproduction, the verification and the gates ran for real on this branch."
      : `This run was live: the agent (${input.agentName}) worked in a checkout of its own with the skills on its path.`;

  const lines = [
    `Opened by Nightshift for incident \`${incident.id}\` (${incident.source}), run \`${input.runId}\`. ${modeNote}`,
    "",
    "## The incident",
    "",
    `- What: ${incident.title}`,
    `- Where: \`${incident.culprit}\`${request}${body}`,
    `- When: ${incident.occurredAt}${incident.release ? `, release \`${incident.release}\`` : ""}${incident.environment ? `, ${incident.environment}` : ""}`,
    `- Flag: ${incident.flag ? `\`sample.bugs: ${incident.flag}\`` : "none"}`,
    "",
    "## The reproduction",
    "",
    `\`${reproPath}\`, run with the flag on${reproduce ? `, failed on the unfixed code (exit ${reproduce.data["code"]}) and passes after the fix.` : "."}`,
    ...(reproduce ? ["", "```", testSummary(reproduce.data["output"], 10), "```"] : []),
    "",
    "## The fix",
    "",
    `${input.counts.files} files, +${input.counts.added} −${input.counts.removed}, ${input.counts.newFiles} new, on \`${input.branch}\` from \`${input.base.slice(0, 10)}\`.`,
    "",
    ...input.files.map((f) => `- \`${f}\``),
    "",
    "## Verification",
    "",
    "| Command | Result |",
    "| --- | --- |",
    ...verifyRuns.map((e) => `| \`${e.data["command"]}\` | ${e.data["code"] === 0 ? "passed" : `exited ${e.data["code"]}`} in ${((e.data["durationMs"] as number) / 1000).toFixed(1)}s |`),
    "",
    "## The gates",
    "",
    `Review: ${reviewVerdict ? `\`${firstLine(reviewText) || (reviewVerdict.passed ? "APPROVED" : "REFUSED")}\`` : "not reached"}`,
    ...rest(reviewText),
    "",
    `Simplicity: ${simpleVerdict ? `\`${firstLine(simpleText) || (simpleVerdict.passed ? "SIMPLE" : "NOT SIMPLE")}\`` : "not reached"}`,
    ...rest(simpleText),
    "",
    `Mechanical findings: ${findings.length ? findings.map((f) => `\`${f}\``).join(", ") : "none"}.`,
    ...(notes.length ? ["", "## Seen, not touched", "", ...notes.map((n) => `- ${n}`)] : []),
    "",
    "## Before merging",
    "",
    input.autoMerge
      ? "Auto-merge is on for this run: the pull request merges itself when the checks are green. Close it to stop that."
      : "Auto-merge is off. A person reads the title, the fix and the verification table, and merges.",
    "",
    `Every step of the run, with the agent's messages redacted, is on the Nightshift dashboard under incident \`${incident.id}\`.`,
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const firstLine = (text: string) => text.split("\n")[0]?.trim() ?? "";
const rest = (text: string) => {
  const lines = text.split("\n").slice(1).map((l) => l.trimEnd()).filter((l) => l.trim());
  return lines.length ? ["", ...lines] : [];
};

export async function openPullRequest(input: PullRequestInput, deps: PullRequestDeps): Promise<PullRequest> {
  const run = deps.run ?? sh;
  const cwd = deps.worktreeDir;
  const options: ShellOptions = { env: deps.env ?? {} };
  const title = pullRequestTitle(input.incident);
  const body = pullRequestBody(input);
  const bodyFile = join(tmpdir(), `nightshift-pr-${randomUUID()}.md`);
  await writeFile(bodyFile, body);
  const q = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
  const git = `git -c user.name=${q(deps.author.name)} -c user.email=${q(deps.author.email)}`;
  try {
    // Everything the agent changed, and not the skills Nightshift put on its path.
    await must(`${git} add -A -- . ':(glob,exclude)**/.claude/**' ':(glob,exclude).nightshift-patch'`, cwd, options);
    await must(`${git} commit -q -m ${q(title)} -m ${q(`Nightshift run ${input.runId}, incident ${input.incident.id}.`)}`, cwd, options);
    const commit = (await must("git rev-parse HEAD", cwd, options)).stdout.trim();
    await must(`git push -q -u origin ${q(input.branch)}`, cwd, options);
    const base = await baseBranch(run, cwd, options);
    const label = await run(`gh label create ${q(deps.label)} --force --description 'Opened by Nightshift' --color 1d1f20`, cwd, options);
    const create = await run(`gh pr create --head ${q(input.branch)} --base ${q(base)} --title ${q(title)} --body-file ${q(bodyFile)} --label ${q(deps.label)}`, cwd, options);
    if (create.code !== 0) {
      throw new Error(`gh could not open the pull request (exit ${create.code}):\n${(label.code === 0 ? "" : label.output) + create.output.trim()}\nThe branch ${input.branch} is pushed; a person can open it by hand.`);
    }
    const url = create.stdout.trim().split("\n").find((l) => /^https?:\/\//.test(l.trim()))?.trim();
    if (!url) throw new Error(`gh printed no pull request URL:\n${create.output.trim()}\nThe branch ${input.branch} is pushed; a person can open it by hand.`);
    const number = Number(/\/(\d+)$/.exec(url)?.[1] ?? 0);
    let autoMerge: PullRequest["autoMerge"] = "off";
    if (input.autoMerge) {
      await must(`gh pr merge ${q(url)} --auto --squash`, cwd, options);
      autoMerge = "queued";
    }
    return { url, number, autoMerge, commit };
  } finally {
    await rm(bodyFile, { force: true });
  }
}

/** The remote's default branch, or main when the remote does not say. */
async function baseBranch(run: PullRequestDeps["run"] & object, cwd: string, options: ShellOptions): Promise<string> {
  const head = await run("git symbolic-ref --short refs/remotes/origin/HEAD", cwd, options);
  if (head.code === 0 && head.stdout.trim()) return head.stdout.trim().replace(/^origin\//, "");
  const remote = await run("git ls-remote --symref origin HEAD", cwd, options);
  const match = /ref: refs\/heads\/(\S+)\s+HEAD/.exec(remote.stdout);
  return match?.[1] ?? "main";
}
