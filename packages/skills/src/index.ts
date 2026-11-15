import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A skill is a markdown file that teaches the coding agent one thing: how to verify, how to review, how React is
 * written here, how to keep a change simple. The runner puts them on the agent's path and runs the review ones as
 * gates. The prompt template is kept with them because it is the one piece of text the other four are quoted from.
 */
export interface SkillInfo {
  name: string;
  file: string;
  purpose: string;
  /** When the agent is told to read it. */
  when: string;
  /** Whether the runner also applies it as a gate on the finished diff. */
  gate: boolean;
}

export interface Skill extends SkillInfo {
  body: string;
}

export const SKILLS: readonly SkillInfo[] = [
  {
    name: "verify",
    file: "verify.md",
    purpose: "How to run the app, how to write and run a verification scenario, and what done means.",
    when: "Before writing the reproduction, and again before saying the fix is done.",
    gate: false,
  },
  {
    name: "review",
    file: "review.md",
    purpose: "The strict code review checklist a change must pass before a pull request opens.",
    when: "On the finished diff, before the pull request.",
    gate: true,
  },
  {
    name: "react",
    file: "react.md",
    purpose: "How React is written in this codebase: state, effects, forms, data fetching, what not to add.",
    when: "Whenever the change touches a .tsx file.",
    gate: true,
  },
  {
    name: "simple",
    file: "simple.md",
    purpose: "Keep it simple: no cleverness, no abstraction for one call site, and explain any file over 200 lines.",
    when: "On the finished diff, before the pull request.",
    gate: true,
  },
  {
    name: "prompt",
    file: "prompt.md",
    purpose: "The three-section prompt template: Goal, Context, Validation and verification scenarios.",
    when: "The runner fills it in for every incident; the agent reads the result, not the template.",
    gate: false,
  },
];

export function skillsDir(): string {
  // dist/index.js or src/index.ts; the markdown sits beside both in skills/.
  return join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
}

export async function loadSkill(name: string, dir: string = skillsDir()): Promise<Skill> {
  const info = SKILLS.find((s) => s.name === name);
  if (!info) throw new Error(`No skill called "${name}". Known: ${SKILLS.map((s) => s.name).join(", ")}`);
  const body = await readFile(join(dir, info.file), "utf8");
  return { ...info, body };
}

export async function loadSkills(dir: string = skillsDir()): Promise<Skill[]> {
  return Promise.all(SKILLS.map((s) => loadSkill(s.name, dir)));
}

/** The skills the agent reads while it works, in the order it should read them. */
export const AGENT_SKILLS = ["verify", "react", "simple", "review"] as const;

/** The skills the runner applies as gates on the finished diff. */
export const GATE_SKILLS = SKILLS.filter((s) => s.gate).map((s) => s.name);
