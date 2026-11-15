import { describe, expect, it } from "vitest";
import { SKILLS, loadSkill, loadSkills, skillsDir } from "../src/index.js";

describe("the skills", () => {
  it("are the four the agent works by, plus the prompt template", () => {
    expect(SKILLS.map((s) => s.name)).toEqual(["verify", "review", "react", "simple", "prompt"]);
    for (const skill of SKILLS) {
      expect(skill.purpose.length).toBeGreaterThan(20);
      expect(skill.when.length).toBeGreaterThan(10);
    }
  });

  it("each exist as markdown with a title and the headings the runner relies on", async () => {
    const loaded = await loadSkills();
    expect(loaded).toHaveLength(5);
    for (const skill of loaded) {
      expect(skill.body.startsWith(`# `)).toBe(true);
      expect(skill.body.length).toBeGreaterThan(1500);
    }
    const verify = loaded.find((s) => s.name === "verify")!;
    for (const heading of ["## Run the app", "## Write a scenario", "## Run the scenarios", "## What done means"]) {
      expect(verify.body).toContain(heading);
    }
    const review = loaded.find((s) => s.name === "review")!;
    expect(review.body).toContain("## The checklist");
    expect(review.body).toContain("## The verdict");
    const simple = loaded.find((s) => s.name === "simple")!;
    expect(simple.body).toMatch(/200 lines/);
  });

  it("the prompt template has the three sections in order", async () => {
    const prompt = await loadSkill("prompt");
    const goal = prompt.body.indexOf("## Goal");
    const context = prompt.body.indexOf("## Context");
    const validation = prompt.body.indexOf("## Validation and verification scenarios");
    expect(goal).toBeGreaterThan(0);
    expect(context).toBeGreaterThan(goal);
    expect(validation).toBeGreaterThan(context);
  });

  it("name their files inside the package so the runner can copy them", () => {
    expect(skillsDir()).toMatch(/packages\/skills\/skills$/);
  });
});
