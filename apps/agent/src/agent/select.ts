import { loadTranscript, recordedAgent } from "./recorded.js";
import { sdkAgent } from "./sdk.js";
import type { CodingAgent } from "./types.js";

export interface AgentChoice {
  agent: CodingAgent;
  mode: "dry-run" | "live";
  reason: string;
}

/**
 * Live when ANTHROPIC_API_KEY is set, the recorded fixture otherwise. The choice is logged on the run so nobody
 * mistakes a replay for a real fix.
 */
export async function chooseAgent(options: { env?: NodeJS.ProcessEnv; fixtureDir?: string; forceDryRun?: boolean }): Promise<AgentChoice> {
  const env = options.env ?? process.env;
  if (env["ANTHROPIC_API_KEY"] && !options.forceDryRun) {
    return { agent: sdkAgent(), mode: "live", reason: "ANTHROPIC_API_KEY is set" };
  }
  if (!options.fixtureDir) throw new Error("no ANTHROPIC_API_KEY and no fixture to replay: nothing can run");
  const transcript = await loadTranscript(options.fixtureDir);
  return {
    agent: recordedAgent(options.fixtureDir, transcript),
    mode: "dry-run",
    reason: options.forceDryRun ? "dry run asked for" : "no ANTHROPIC_API_KEY in the environment",
  };
}
