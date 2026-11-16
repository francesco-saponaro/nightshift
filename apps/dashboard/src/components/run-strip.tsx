import { STEP_LABELS, elapsed, type StepSummary } from "../timeline.js";

/** The pipeline as one strip: a cell per step, filled by what happened to it. Nightshift's own picture of a run. */
export function RunStrip({ steps, large = false }: { steps: StepSummary[]; large?: boolean }) {
  return (
    <ol className={`strip${large ? " large" : ""}`} aria-label="The run, step by step">
      {steps.map((s) => (
        <li key={s.step} data-status={s.status} aria-label={stepLabel(s)} title={stepLabel(s)} />
      ))}
    </ol>
  );
}

export function stepLabel(s: StepSummary): string {
  const name = STEP_LABELS[s.step];
  switch (s.status) {
    case "ok":
      return `${name}: ok, ${elapsed(s.durationMs)}`;
    case "failed":
      return `${name}: failed after ${elapsed(s.durationMs)}`;
    case "running":
      return `${name}: running`;
    case "off":
      return `${name}: not opened`;
    default:
      return `${name}: not reached`;
  }
}
