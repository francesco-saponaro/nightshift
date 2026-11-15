import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { applyPatch } from "../pipeline/worktree.js";
import type { AgentMessage, AgentTurn, AgentTurnInput, CodingAgent, Phase } from "./types.js";

const MessageSchema = z.object({
  role: z.enum(["assistant", "tool", "system"]),
  text: z.string(),
  tool: z.object({ name: z.string(), input: z.string() }).optional(),
});

const PhaseSchema = z.object({
  messages: z.array(MessageSchema),
  /** A unified diff beside the transcript, applied to the worktree when the phase runs. */
  patch: z.string().optional(),
  /** The agent's final message for the phase. */
  final: z.string(),
});

export const TranscriptSchema = z.object({
  recorded: z.boolean(),
  note: z.string(),
  agent: z.string(),
  phases: z.object({
    reproduce: PhaseSchema,
    fix: PhaseSchema,
    review: PhaseSchema,
    simple: PhaseSchema,
  }),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

export async function loadTranscript(fixtureDir: string): Promise<Transcript> {
  return TranscriptSchema.parse(JSON.parse(await readFile(join(fixtureDir, "transcript.json"), "utf8")));
}

/**
 * Replays one fixture. Each phase's messages are returned as if the agent had said them, and its patch is applied to
 * the worktree the way the live agent's edits would land. Everything after that (running the reproduction, the
 * verification, the gates) is real.
 */
export function recordedAgent(fixtureDir: string, transcript: Transcript): CodingAgent {
  return {
    kind: "recorded",
    name: `recorded:${fixtureDir.split("/").at(-1)}`,
    async turn(input: AgentTurnInput): Promise<AgentTurn> {
      const phase = transcript.phases[input.phase as Phase];
      if (phase.patch) {
        const patch = await readFile(join(fixtureDir, phase.patch), "utf8");
        await applyPatch(input.worktreeDir, patch, input.projectDir);
      }
      const messages: AgentMessage[] = [...phase.messages, { role: "assistant", text: phase.final }];
      return { text: phase.final, messages };
    },
  };
}
