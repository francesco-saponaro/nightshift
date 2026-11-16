import type { RunEvent } from "./api/types.js";

/** The pipeline's steps, in the order the runner walks them. "received" is the webhook, not a step. */
export const STEPS = ["worktree", "prompt", "reproduce", "fix", "verify", "review", "simple", "pr", "done"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABELS: Record<Step, string> = {
  worktree: "Checkout",
  prompt: "Prompt",
  reproduce: "Reproduction",
  fix: "Fix",
  verify: "Verification",
  review: "Review",
  simple: "Simplicity",
  pr: "Pull request",
  done: "Done",
};

export type StepStatus = "ok" | "failed" | "running" | "skipped" | "off";

export interface StepSummary {
  step: Step;
  status: StepStatus;
  /** The step's last word: the ok or failed event's summary, or the started one's while it runs. */
  summary: string;
  durationMs: number;
  events: RunEvent[];
}

/** Folds a run's events into one row per step: what happened, how long it took, and every event under it. */
export function stepsOf(events: RunEvent[]): StepSummary[] {
  return STEPS.map((step) => {
    const own = events.filter((e) => e.step === step);
    const last = own.at(-1);
    const ended = own.find((e) => e.status === "ok" || e.status === "failed");
    let status: StepStatus = "skipped";
    if (ended) status = ended.status === "ok" ? "ok" : "failed";
    else if (step === "pr" && last?.status === "info" && last.summary.startsWith("not opened")) status = "off";
    else if (last) status = "running";
    const first = own[0];
    const durationMs = first && last ? Date.parse(last.at) - Date.parse(first.at) : 0;
    return { step, status, summary: ended?.summary ?? last?.summary ?? "", durationMs, events: own };
  });
}

export interface VerificationCommand {
  command: string;
  code: number;
  durationMs: number;
  output: string;
}

/** The verification commands a run ran, with their exit code, time and output. */
export function verificationOf(events: RunEvent[]): VerificationCommand[] {
  return events
    .filter((e) => e.step === "verify" && typeof e.data["command"] === "string")
    .map((e) => ({ command: String(e.data["command"]), code: Number(e.data["code"] ?? 0), durationMs: Number(e.data["durationMs"] ?? 0), output: String(e.data["output"] ?? "") }));
}

export function elapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms / 1000)} s`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes} m ${Math.round((ms - minutes * 60_000) / 1000)} s`;
}
