import { SEEDED_BUGS } from "@nightshift/sample/flags";
import { AGENT_SKILLS, SKILLS, loadSkill } from "@nightshift/skills";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Incident } from "../incident.js";

/**
 * The three-section prompt, filled from the incident. The template is `prompt.md` in packages/skills; this file only
 * replaces its tokens. The agent is told what to achieve, what it needs to know, and the commands it is judged by.
 */

export function reproPath(incidentId: string): string {
  return `test/incident-${incidentId}.test.ts`;
}

/** apps/sample, as a sibling of this package whether it runs from src or dist. */
export function sampleDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "sample");
}

export async function scenarioList(dir: string = sampleDir()): Promise<string[]> {
  const files = await readdir(join(dir, "verification"));
  return files
    .filter((f) => f.endsWith(".spec.ts"))
    .sort()
    .map((f) => `verification/${f}`);
}

export interface PromptOptions {
  template?: string;
  scenarios?: string[];
}

const SOURCE_NAMES: Record<Incident["source"], string> = { sentry: "Sentry", posthog: "PostHog" };

export async function buildPrompt(incident: Incident, options: PromptOptions = {}): Promise<string> {
  const template = options.template ?? (await loadSkill("prompt")).body;
  const scenarios = options.scenarios ?? (await scenarioList());
  const bug = incident.flag ? SEEDED_BUGS.find((b) => b.name === incident.flag) : undefined;

  const flagNote = incident.flag
    ? `The app was running with the flag \`${incident.flag}\` on, which marks the code path that shipped this bug; your fix makes the app correct with that flag on, by removing that path.`
    : "No seeded-bug flag was reported with this incident, so start from the stack and the request; if the cause turns out to be one of the flagged paths, treat its flag as on.";
  const bugNote = bug
    ? `For this incident it says:\n\n> ${bug.symptom} (\`${bug.file}\`)`
    : incident.flag
      ? `The flag \`${incident.flag}\` is not one it knows; read the file anyway, then follow the stack.`
      : "No flag was reported; read it anyway, because the bug may be one of the three.";

  const tokens: Record<string, string> = {
    incidentId: incident.id,
    source: SOURCE_NAMES[incident.source],
    occurredAt: incident.occurredAt,
    title: incident.title,
    request: incident.request ? `${incident.request.method} ${incident.request.url}` : incident.culprit,
    requestBody: incident.request?.body !== undefined ? ` with the body \`${JSON.stringify(incident.request.body)}\`` : "",
    release: incident.release ?? "unknown",
    flag: incident.flag ?? "",
    flagNote,
    bugNote,
    reproPath: reproPath(incident.id),
    stack: incident.stack || "(the tracker sent no frames)",
    skills: AGENT_SKILLS.map((name) => {
      const s = SKILLS.find((x) => x.name === name)!;
      return `- \`${s.name}\`: ${s.purpose} Read it: ${s.when.charAt(0).toLowerCase()}${s.when.slice(1)}`;
    }).join("\n"),
    scenarios: scenarios.map((s) => `- \`${s}\``).join("\n"),
  };

  // Everything above the rule is the template's own explanation; the agent gets what is below it.
  const body = template.includes("\n---\n") ? template.slice(template.indexOf("\n---\n") + "\n---\n".length) : template;
  const filled = body.replace(/\{\{([a-zA-Z]+)\}\}/g, (match, name: string) => {
    const value = tokens[name];
    if (value === undefined) throw new Error(`the prompt template uses a token this builder does not fill: ${match}`);
    return value;
  });
  return filled.trim() + "\n";
}
