import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parseDiff, type Diff } from "./gates.js";
import { must, sh } from "./shell.js";

export interface RepoLocation {
  /** The git repository's top folder. */
  repoRoot: string;
  /** Where the app lives inside it, "" when the app is the repository. */
  projectDir: string;
}

export async function findRepo(dir: string): Promise<RepoLocation> {
  const repoRoot = (await must("git rev-parse --show-toplevel", dir)).stdout.trim();
  const projectDir = relative(repoRoot, dir).split("\\").join("/");
  return { repoRoot, projectDir: projectDir === "." ? "" : projectDir };
}

export interface Worktree {
  dir: string;
  branch: string;
  /** The commit the worktree started from. */
  base: string;
}

/**
 * One checkout per run, on its own branch, from the current HEAD of the repository. The agent works there and
 * nowhere else; the main checkout is never touched. `git worktree` shares the object store, so this is cheap.
 */
export async function createWorktree(options: { repoRoot: string; dir: string; branch: string; ref?: string }): Promise<Worktree> {
  const ref = options.ref ?? "HEAD";
  await mkdir(dirname(options.dir), { recursive: true });
  await sh(`git worktree remove --force "${options.dir}"`, options.repoRoot);
  await sh(`git branch -D "${options.branch}"`, options.repoRoot);
  await must(`git worktree add -b "${options.branch}" "${options.dir}" ${ref}`, options.repoRoot);
  const base = (await must("git rev-parse HEAD", options.dir)).stdout.trim();
  return { dir: options.dir, branch: options.branch, base };
}

export async function removeWorktree(repoRoot: string, dir: string): Promise<void> {
  const branch = (await sh("git branch --show-current", dir)).stdout.trim();
  await sh(`git worktree remove --force "${dir}"`, repoRoot);
  await rm(dir, { recursive: true, force: true });
  await sh("git worktree prune", repoRoot);
  if (branch) await sh(`git branch -D "${branch}"`, repoRoot);
}

/** Applies a unified diff whose paths are relative to the project folder. */
export async function applyPatch(worktreeDir: string, patch: string, projectDir: string): Promise<void> {
  const file = join(worktreeDir, ".nightshift-patch");
  await writeFile(file, patch.endsWith("\n") ? patch : `${patch}\n`);
  const directory = projectDir ? ` --directory="${projectDir}"` : "";
  try {
    await must(`git apply --whitespace=nowarn${directory} "${file}"`, worktreeDir);
  } finally {
    await rm(file, { force: true });
  }
}

/** Everything the run changed in the worktree, tracked and untracked, except Nightshift's own files (the skills it put on the agent's path). */
export async function diffOf(worktreeDir: string, exclude: string[] = ["**/.claude/**", ".nightshift-patch"]): Promise<Diff> {
  const pathspec = exclude.map((e) => `':(glob,exclude)${e}'`).join(" ");
  await must(`git add -A -- . ${pathspec}`, worktreeDir);
  const text = (await must("git diff --cached --no-color", worktreeDir)).stdout;
  const numstat = (await must("git diff --cached --numstat", worktreeDir)).stdout;
  await must("git reset -q", worktreeDir);
  return parseDiff(text, numstat);
}
