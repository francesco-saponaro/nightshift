import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sh } from "../src/pipeline/shell.js";
import { applyPatch, createWorktree, diffOf, findRepo, removeWorktree } from "../src/pipeline/worktree.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "nightshift-wt-"));
  await sh("git init -q -b main", root);
  await sh('git config user.email "test@example.com" && git config user.name "Test"', root);
  await writeFile(join(root, "a.txt"), "one\n");
  await sh("git add . && git commit -q -m first", root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the worktree step", () => {
  it("finds the repository root and the project folder inside it", async () => {
    const repo = await findRepo(root);
    expect(repo).toEqual({ repoRoot: root, projectDir: "" });
    const nested = join(root, "projects", "x");
    await sh(`mkdir -p ${nested}`, root);
    expect(await findRepo(nested)).toEqual({ repoRoot: root, projectDir: "projects/x" });
  });

  it("checks out HEAD on a new branch in a folder of its own, applies a patch and reads the diff back", async () => {
    const wt = await createWorktree({ repoRoot: root, dir: join(root, ".worktrees", "run-1"), branch: "nightshift/inc-1" });
    expect(wt.dir).toBe(join(root, ".worktrees", "run-1"));
    expect(await readFile(join(wt.dir, "a.txt"), "utf8")).toBe("one\n");
    expect((await sh("git branch --show-current", wt.dir)).stdout.trim()).toBe("nightshift/inc-1");

    const patch = `--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-one
+two
`;
    await applyPatch(wt.dir, patch, "");
    expect(await readFile(join(wt.dir, "a.txt"), "utf8")).toBe("two\n");
    const diff = await diffOf(wt.dir);
    expect(diff.files).toEqual([{ path: "a.txt", added: 1, removed: 1, isNew: false, isDeleted: false, renamed: false }]);

    await removeWorktree(root, wt.dir);
    expect((await sh("git worktree list", root)).stdout).not.toContain("run-1");
    expect((await sh("git branch --list nightshift/inc-1", root)).stdout.trim()).toBe("");
  });

  it("applies a patch under the project folder when the app is nested in the repository", async () => {
    await sh("mkdir -p projects/x && echo one > projects/x/b.txt && git add . && git commit -q -m nested", root);
    const wt = await createWorktree({ repoRoot: root, dir: join(root, ".worktrees", "run-2"), branch: "nightshift/inc-2" });
    await applyPatch(wt.dir, "--- a/b.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-one\n+two\n", "projects/x");
    expect(await readFile(join(wt.dir, "projects", "x", "b.txt"), "utf8")).toBe("two\n");
    const diff = await diffOf(wt.dir);
    expect(diff.files[0]?.path).toBe("projects/x/b.txt");
    await removeWorktree(root, wt.dir);
  });

  it("refuses a patch that does not apply, with git's reason", async () => {
    const wt = await createWorktree({ repoRoot: root, dir: join(root, ".worktrees", "run-3"), branch: "nightshift/inc-3" });
    await expect(applyPatch(wt.dir, "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-three\n+four\n", "")).rejects.toThrow(/patch does not apply|does not match/);
    await removeWorktree(root, wt.dir);
  });
});

describe("diffOf", () => {
  it("leaves the skills Nightshift writes under .claude out of the diff, wherever the app sits", async () => {
    await sh("mkdir -p projects/x && echo one > projects/x/b.txt && git add . && git commit -q -m nested", root);
    const wt = await createWorktree({ repoRoot: root, dir: join(root, ".worktrees", "run-4"), branch: "nightshift/inc-4" });
    await sh("mkdir -p projects/x/.claude/skills/verify && echo skill > projects/x/.claude/skills/verify/SKILL.md && echo two > projects/x/b.txt", wt.dir);
    const diff = await diffOf(wt.dir);
    expect(diff.files.map((f) => f.path)).toEqual(["projects/x/b.txt"]);
    await removeWorktree(root, wt.dir);
  });
});
