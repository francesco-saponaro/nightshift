import type { Phase } from "../agent/types.js";

/**
 * What the agent is told at each phase, after the three-section prompt. The run holds the agent to the order: no fix
 * before a failing reproduction, no verdict before a diff.
 */
export interface PhaseContext {
  reproPath: string;
  flag: string | null;
  /** The reproduction's output, for the fix phase. */
  reproOutput?: string;
  /** The finished diff, for the review phases. */
  diff?: string;
  /** The mechanical findings already made on the diff, for the review phases. */
  findings?: string[];
  /** The previous verdict, when a phase is sent back once. */
  previous?: string;
}

const RESPONSE_RULE = "Reply in plain text, no headings. Do not ask questions; there is nobody to answer them. When you are done, stop.";

export function phaseInstruction(phase: Phase, ctx: PhaseContext): string {
  const flag = ctx.flag ? `SAMPLE_BUGS=${ctx.flag}` : "SAMPLE_BUGS=";
  switch (phase) {
    case "reproduce":
      return [
        "## This phase: the reproduction only",
        "",
        `Write \`apps/sample/${ctx.reproPath}\` and nothing else. It is a unit test that fails on the current code for the reason the incident describes and will pass once the cause is fixed. It sets the flag the incident names through \`buildApp({ bugs })\`. Do not change any other file yet. Run it once with \`${flag} pnpm -C apps/sample exec vitest run ${ctx.reproPath}\` and end your message with the command's output.`,
        "",
        RESPONSE_RULE,
      ].join("\n");
    case "fix":
      return [
        "## This phase: the fix",
        "",
        "The reproduction failed as it should. Its output:",
        "",
        "```",
        (ctx.reproOutput ?? "").trim(),
        "```",
        "",
        `Now fix the cause, following the skills, with the smallest diff that makes the reproduction pass. Then run every command of the validation section in order and end your message with each command and its last lines of output. Do not touch \`${ctx.reproPath}\` unless it was wrong.`,
        "",
        RESPONSE_RULE,
      ].join("\n");
    case "review":
      return [
        "## This phase: the review",
        "",
        "Apply `review.md` to the diff below, line by line, as the reviewer, not as the author. The program already found these on the diff (empty means none):",
        "",
        bullet(ctx.findings),
        ...(ctx.previous ? ["", "Your previous verdict was refused and the findings were addressed:", "", "```", ctx.previous, "```"] : []),
        "",
        "```diff",
        (ctx.diff ?? "").trim(),
        "```",
        "",
        "End your message with exactly one verdict line, as the skill says: `APPROVED` or `REFUSED: <rule number> — <one sentence>`.",
        "",
        RESPONSE_RULE,
      ].join("\n");
    case "simple":
      return [
        "## This phase: simplicity",
        "",
        "Apply `simple.md` to the same diff. Count files changed, lines added and removed, and anything added from the second list. The program already found these (empty means none):",
        "",
        bullet(ctx.findings),
        "",
        "```diff",
        (ctx.diff ?? "").trim(),
        "```",
        "",
        "End your message with exactly one verdict line: `SIMPLE — <the counts>` or `NOT SIMPLE: <rule number> — <one sentence>`.",
        "",
        RESPONSE_RULE,
      ].join("\n");
  }
}

function bullet(items: string[] | undefined): string {
  return items && items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)";
}
