/**
 * The coding agent, as the pipeline sees it. A run talks to it in phases on one conversation: write the reproduction,
 * fix, review your diff, judge its simplicity. Two implementations: the live one drives the Claude Agent SDK; the
 * recorded one replays a transcript and applies its patches, so the whole pipeline runs with no key.
 */
export type Phase = "reproduce" | "fix" | "review" | "simple";

export interface AgentMessage {
  role: "assistant" | "tool" | "system";
  text: string;
  tool?: { name: string; input: string } | undefined;
}

export interface AgentTurnInput {
  phase: Phase;
  /** The whole prompt for this phase: the three-section prompt plus the phase's instruction. */
  prompt: string;
  /** The checkout the agent works in. */
  worktreeDir: string;
  /** Where the app sits inside it, "" when the app is the repository. */
  projectDir: string;
}

export interface AgentTurn {
  /** The agent's last message, where the verdict line lives for the review phases. */
  text: string;
  messages: AgentMessage[];
  /** Cost, when the agent reports one. */
  costUsd?: number;
}

export interface CodingAgent {
  kind: "recorded" | "live";
  name: string;
  turn(input: AgentTurnInput): Promise<AgentTurn>;
}
