import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentMessage, AgentTurn, AgentTurnInput, CodingAgent } from "./types.js";

export interface SdkAgentOptions {
  model?: string;
  maxTurns?: number;
  /** Every message as it arrives, for the run's live log. */
  onMessage?: (message: AgentMessage) => void;
}

/**
 * The live agent on the Claude Agent SDK. One session per run: the first phase starts it, the next ones resume it,
 * so the fix knows what the reproduction found and the review knows what the fix changed. The agent edits inside the
 * worktree only (cwd), with the skills under .claude/skills/ on its path. The key comes from ANTHROPIC_API_KEY in the
 * environment and is never read, logged or passed anywhere by this file.
 */
export function sdkAgent(options: SdkAgentOptions = {}): CodingAgent {
  let sessionId: string | undefined;
  return {
    kind: "live",
    name: `claude-agent-sdk${options.model ? `:${options.model}` : ""}`,
    async turn(input: AgentTurnInput): Promise<AgentTurn> {
      const messages: AgentMessage[] = [];
      let text = "";
      let costUsd: number | undefined;
      const cwd = input.projectDir ? `${input.worktreeDir}/${input.projectDir}` : input.worktreeDir;
      const stream = query({
        prompt: input.prompt,
        options: {
          cwd,
          allowedTools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
          permissionMode: "acceptEdits",
          settingSources: ["project"],
          maxTurns: options.maxTurns ?? 60,
          ...(options.model ? { model: options.model } : {}),
          ...(sessionId ? { resume: sessionId } : {}),
        },
      });
      for await (const message of stream) {
        for (const m of toAgentMessages(message)) {
          messages.push(m);
          options.onMessage?.(m);
        }
        if (message.type === "system" && message.subtype === "init") sessionId = message.session_id;
        if (message.type === "result") {
          sessionId = message.session_id;
          costUsd = message.total_cost_usd;
          if (message.subtype === "success") text = message.result;
          else if (message.is_error) throw new Error(`the agent stopped: ${message.subtype}`);
        }
      }
      if (!text) text = [...messages].reverse().find((m) => m.role === "assistant")?.text ?? "";
      return { text, messages, ...(costUsd !== undefined ? { costUsd } : {}) };
    },
  };
}

export function toAgentMessages(message: SDKMessage): AgentMessage[] {
  if (message.type === "assistant") {
    const out: AgentMessage[] = [];
    for (const block of message.message.content) {
      if (block.type === "text" && block.text.trim()) out.push({ role: "assistant", text: block.text });
      if (block.type === "tool_use") out.push({ role: "tool", text: `${block.name}`, tool: { name: block.name, input: JSON.stringify(block.input) } });
    }
    return out;
  }
  if (message.type === "user" && Array.isArray(message.message.content)) {
    const out: AgentMessage[] = [];
    for (const block of message.message.content) {
      if (block.type === "tool_result") {
        const content = typeof block.content === "string" ? block.content : (block.content ?? []).map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
        out.push({ role: "tool", text: content.slice(0, 4000) });
      }
    }
    return out;
  }
  if (message.type === "system" && message.subtype === "init") {
    return [{ role: "system", text: `session ${message.session_id} on ${message.model}` }];
  }
  return [];
}
