import type { RunRow } from "../api/types.js";

export type Tone = "positive" | "negative" | "warning" | "neutral";

export function Pill({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className="pill" data-tone={tone}>
      {children}
    </span>
  );
}

/** One word for a run's state, and the tone that goes with it. */
export function runState(run: RunRow | undefined): { label: string; tone: Tone } {
  if (!run) return { label: "No run", tone: "neutral" };
  switch (run.status) {
    case "fixed":
      return { label: "Fixed", tone: "positive" };
    case "failed":
      return { label: "Needs a person", tone: "negative" };
    case "running":
      return { label: "Running", tone: "warning" };
    default:
      return { label: "Queued", tone: "neutral" };
  }
}
