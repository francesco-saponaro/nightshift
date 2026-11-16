import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Incident } from "../src/incident.js";
import { openPullRequest, pullRequestBody, pullRequestTitle, seenNotTouched, type PullRequestInput } from "../src/pipeline/pr.js";
import { sh } from "../src/pipeline/shell.js";
import { createWorktree } from "../src/pipeline/worktree.js";
import type { RunEvent } from "../src/store.js";
import { parseSentry } from "../src/webhooks/sentry.js";

const fixtureDir = new URL("../../../fixtures/empty-title/", import.meta.url);

let incident: Incident;
let events: RunEvent[];
beforeEach(async () => {
  incident = parseSentry(JSON.parse(await readFile(new URL("webhook.json", fixtureDir), "utf8")));
  events = JSON.parse(await readFile(new URL("events.json", fixtureDir), "utf8"));
});

function input(): PullRequestInput {
  return {
    incident,
    runId: "run-1",
    mode: "dry-run",
    agentName: "recorded:empty-title",
    branch: "nightshift/inc-f42f2815",
    base: "1805e3af7a5c",
    counts: { files: 3, added: 34, removed: 10, newFiles: 1 },
    files: ["apps/sample/src/server/app.ts", "apps/sample/src/server/flags.ts", "apps/sample/test/incident-inc-f42f2815.test.ts"],
    events,
    autoMerge: false,
  };
}

describe("the pull request title and body", () => {
  it("names the incident and what broke, short enough to read in a list", () => {
    expect(pullRequestTitle(incident)).toBe('inc-f42f2815: new row for relation "todos" violates check constraint "todos_title_not_blank"');
    const long = { ...incident, title: "x".repeat(200) };
    expect(pullRequestTitle(long).length).toBeLessThanOrEqual(100);
    expect(pullRequestTitle(long).endsWith("…")).toBe(true);
  });

  it("tells the reader what happened, what changed and what proved it, from the run's events", () => {
    const body = pullRequestBody(input());
    expect(body).toContain("## The incident");
    expect(body).toContain("`POST /api/todos`");
    expect(body).toContain("`sample.bugs: empty-title`");
    expect(body).toContain("## The reproduction");
    expect(body).toContain("`apps/sample/test/incident-inc-f42f2815.test.ts`");
    expect(body).toContain("expected 500 to be 400");
    expect(body).toContain("## The fix");
    expect(body).toContain("3 files, +34 −10, 1 new");
    expect(body).toContain("- `apps/sample/src/server/app.ts`");
    expect(body).toContain("## Verification");
    expect(body).toMatch(/\| `pnpm -C apps\/sample test` \| passed in \d+\.\ds \|/);
    expect(body).toContain("## The gates");
    expect(body).toContain("Review: `APPROVED`");
    expect(body).toContain("Simplicity: `SIMPLE — 3 files, +34 −10");
    expect(body).toContain("13: the reproduction's header comment explains the incident");
    expect(body).toContain("replayed from a recorded transcript");
    expect(body).toContain("Auto-merge is off");
  });

  it("says when the pull request will merge itself", () => {
    expect(pullRequestBody({ ...input(), autoMerge: true })).toContain("merges itself when the checks are green");
  });

  it("carries the agent's 'Seen, not touched' notes and nothing else from its messages", () => {
    const text = "Fixed at the cause.\n\nSeen, not touched:\n- the PATCH route accepts a blank title too\n- dates.ts rounds twice\n\nDiff: 2 files.";
    expect(seenNotTouched(text)).toEqual(["the PATCH route accepts a blank title too", "dates.ts rounds twice"]);
    expect(seenNotTouched("Fixed at the cause. Diff: 2 files.")).toEqual([]);
    const body = pullRequestBody({ ...input(), events: [...events, { runId: "run-1", seq: 99, step: "fix", status: "info", at: "2026-11-16T00:00:00Z", summary: "assistant: x", data: { role: "assistant", text } }] });
    expect(body).toContain("## Seen, not touched");
    expect(body).toContain("- the PATCH route accepts a blank title too");
  });
});

describe("opening the pull request", () => {
  let root: string;
  let origin: string;
  let bin: string;
  let worktreeDir: string;
  let ghLog: string;
  let bodyFile: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "nightshift-pr-"));
    origin = join(root, "origin.git");
    const repo = join(root, "repo");
    bin = join(root, "bin");
    ghLog = join(root, "gh.log");
    bodyFile = join(root, "body.md");
    await sh(`git init -q --bare "${origin}"`, root);
    await mkdir(repo);
    await sh("git init -q -b main", repo);
    await sh('git config user.email "test@example.com" && git config user.name "Test"', repo);
    await writeFile(join(repo, "a.txt"), "one\n");
    await sh(`git add . && git commit -q -m first && git remote add origin "${origin}" && git push -q -u origin main`, repo);
    worktreeDir = join(root, "wt");
    await createWorktree({ repoRoot: repo, dir: worktreeDir, branch: "nightshift/inc-f42f2815" });
    // The agent's edits, and Nightshift's own skills, which must not be committed.
    await writeFile(join(worktreeDir, "a.txt"), "two\n");
    await writeFile(join(worktreeDir, "b.txt"), "new\n");
    await mkdir(join(worktreeDir, ".claude", "skills", "verify"), { recursive: true });
    await writeFile(join(worktreeDir, ".claude", "skills", "verify", "SKILL.md"), "skill\n");
    // A stand-in for gh that records what it was asked and answers the way gh does.
    await mkdir(bin);
    await writeFile(
      join(bin, "gh"),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${ghLog}"
if [[ -n "\${GH_FAIL:-}" ]]; then echo "gh: auth required" >&2; exit 4; fi
if [[ "$1 $2" == "pr create" ]]; then
  while [[ $# -gt 0 ]]; do if [[ "$1" == "--body-file" ]]; then cp "$2" "${bodyFile}"; fi; shift; done
  echo "https://github.com/someone/sample/pull/7"
fi
`,
    );
    await chmod(join(bin, "gh"), 0o755);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("commits the agent's edits only, pushes the branch, opens a labelled pull request and leaves auto-merge alone", async () => {
    const pr = await openPullRequest(input(), { worktreeDir, label: "nightshift", author: { name: "Nightshift", email: "nightshift@example.com" }, env: { PATH: `${bin}:${process.env["PATH"]}` } });
    expect(pr).toEqual({ url: "https://github.com/someone/sample/pull/7", number: 7, autoMerge: "off", commit: expect.stringMatching(/^[0-9a-f]{40}$/) });

    const pushed = (await sh("git ls-remote --heads origin nightshift/inc-f42f2815", worktreeDir)).stdout;
    expect(pushed).toContain(pr.commit);
    const committed = (await sh(`git show --stat --format=%s%n%an%n%ae ${pr.commit}`, worktreeDir)).stdout;
    expect(committed).toContain(pullRequestTitle(incident));
    expect(committed).toContain("Nightshift\nnightshift@example.com");
    expect(committed).toContain("a.txt");
    expect(committed).toContain("b.txt");
    expect(committed).not.toContain(".claude");

    const calls = (await readFile(ghLog, "utf8")).trim().split("\n");
    expect(calls[0]).toMatch(/^label create nightshift --force/);
    expect(calls[1]).toMatch(/^pr create --head nightshift\/inc-f42f2815 --base main --title inc-f42f2815: .* --body-file .* --label nightshift$/);
    expect(calls).toHaveLength(2);
    expect(await readFile(bodyFile, "utf8")).toContain("## The incident");
  });

  it("asks for auto-merge when the flag is on, and only then", async () => {
    const pr = await openPullRequest({ ...input(), autoMerge: true }, { worktreeDir, label: "nightshift", author: { name: "Nightshift", email: "n@example.com" }, env: { PATH: `${bin}:${process.env["PATH"]}` } });
    expect(pr.autoMerge).toBe("queued");
    const calls = (await readFile(ghLog, "utf8")).trim().split("\n");
    expect(calls[2]).toBe("pr merge https://github.com/someone/sample/pull/7 --auto --squash");
  });

  it("fails with gh's own words when the pull request cannot be opened, and says the branch is already pushed", async () => {
    const env = { PATH: `${bin}:${process.env["PATH"]}`, GH_FAIL: "1" };
    await expect(openPullRequest(input(), { worktreeDir, label: "nightshift", author: { name: "N", email: "n@example.com" }, env })).rejects.toThrow(/gh: auth required[\s\S]*nightshift\/inc-f42f2815 is pushed/);
    expect((await sh("git ls-remote --heads origin nightshift/inc-f42f2815", worktreeDir)).stdout).toContain("nightshift/inc-f42f2815");
  });
});
