import { useState } from "react";
import type { SkillDoc } from "../api/types.js";
import { Markdown } from "../components/markdown.js";
import { Pill } from "../components/pill.js";

/**
 * The skills as the agent reads them. The question is "what is the agent held to?", so the gates are marked and the
 * column beside the text says how the runner applies each one: when, as what, and which of its lines a program checks
 * on the diff before the agent is even asked (the numbers are the rules in the file).
 */
const USE: Record<string, { phase: string; verdict: string | null; checked: string[] }> = {
  verify: { phase: "Quoted in the prompt's validation section; read before the reproduction and before the fix is called done.", verdict: null, checked: ["The runner runs the six commands itself, in order, and stops at the first failure (verify step)."] },
  review: {
    phase: "After the verification passes: the diff and the program's findings go to the agent as the reviewer.",
    verdict: "APPROVED, or REFUSED: n — reason",
    checked: ["1: a test named after the incident was added", "4: no dependency or workspace file changed", "5: no test deleted, skipped, made exclusive, or stripped of an assertion", "8: no database constraint removed", "9: no wait and no in-process state added", "10: nothing that looks like a key, a token or an address added"],
  },
  react: { phase: "Read by the agent whenever the change touches a .tsx file; the review checklist asks whether it was applied.", verdict: null, checked: ["Judged by the agent in the review; no mechanical check."] },
  simple: {
    phase: "After the review passes: the same diff, with the counts, goes to the agent for the simplicity verdict.",
    verdict: "SIMPLE — the counts, or NOT SIMPLE: n — reason",
    checked: ["6: a flag's branch removed means its entry is marked fixedBy", "7: no file renamed or moved", "8: no file over 200 lines without a word in the pull request", "9: no config, lint or workflow file changed"],
  },
  prompt: { phase: "Filled by the runner for every incident and sent first; every phase's instruction is appended to it.", verdict: null, checked: ["A test keeps the builder's output equal to the recorded prompt in fixtures/."] },
};


export function SkillsScreen({ skills }: { skills: SkillDoc[] }) {
  const [selected, setSelected] = useState(skills[0]?.name ?? "");
  const skill = skills.find((s) => s.name === selected) ?? skills[0];
  return (
    <article>
      <h1 className="text-[24px] leading-8 font-medium">Skills</h1>
      <p className="mt-1">
        Five markdown files the agent gets on its path in every checkout; {skills.filter((s) => s.gate).length} of them are also applied to the finished diff as gates. Edit them to change what the agent does.
      </p>
      <div className="tabs mt-6" role="tablist" aria-label="Skills">
        {skills.map((s) => (
          <button key={s.name} role="tab" aria-selected={s.name === skill?.name} onClick={() => setSelected(s.name)}>
            <span className="mono">{s.file}</span>
            {s.gate ? <span className="text-muted"> · gate</span> : null}
          </button>
        ))}
      </div>
      {/* 1360 at 1440: the text panel 1fr and a 360px column of facts, 24px apart. */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel" aria-label={skill ? `The ${skill.name} skill` : "Skill"}>
          {skill ? (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{skill.purpose}</p>
                  <p className="text-muted text-[13px]">
                    <span className="mono">packages/skills/skills/{skill.file}</span>
                  </p>
                </div>
                <Pill tone={skill.gate ? "positive" : "neutral"}>{skill.gate ? "Applied to the diff as a gate" : "Read by the agent"}</Pill>
              </header>
              <div className="px-5 pt-4 pb-6">
                <Markdown text={skill.body} />
              </div>
            </>
          ) : (
            <p className="empty m-5">No skills were served.</p>
          )}
        </section>
        {skill ? (
          <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="How the runner uses it">
            <h2 className="text-base font-medium">How the runner uses it</h2>
            <dl className="facts mt-2 grid-cols-[96px_1fr]">
              <dt>Read</dt>
              <dd>{skill.when}</dd>
              <dt>Applied</dt>
              <dd>{USE[skill.name]?.phase ?? "By the agent, as it works."}</dd>
              {USE[skill.name]?.verdict ? (
                <>
                  <dt>Verdict line</dt>
                  <dd className="mono">{USE[skill.name]!.verdict}</dd>
                </>
              ) : null}
            </dl>
            <h3 className="mt-4 font-medium">{skill.gate && USE[skill.name]?.verdict ? "Checked by the program first" : "How it is enforced"}</h3>
            <ul className="mt-1 list-disc pl-5 text-[13px]">
              {(USE[skill.name]?.checked ?? []).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {skill.gate && USE[skill.name]?.verdict ? <p className="text-muted mt-3 text-[13px]">Every other line is answered by the agent as the reviewer, and both halves must pass. A refusal goes back once; a second one stops the run.</p> : null}
          </aside>
        ) : null}
      </div>
    </article>
  );
}
