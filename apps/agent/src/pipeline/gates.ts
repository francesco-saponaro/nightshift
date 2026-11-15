import { redact } from "../agent/redact.js";

/**
 * The quality gates. Each skill in packages/skills has two halves: the lines a program can check on the diff
 * (this file) and the lines only a reader can judge (the agent applies the skill and writes a verdict; parseVerdict
 * reads it). Both halves must pass. A finding names the skill and the rule number, so the pull request and the
 * dashboard can point at the sentence it comes from.
 */

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
  isNew: boolean;
  isDeleted: boolean;
  renamed: boolean;
}

export interface Diff {
  text: string;
  files: DiffFile[];
  added: number;
  removed: number;
}

export function parseDiff(text: string, numstat: string): Diff {
  const flags = new Map<string, { isNew: boolean; isDeleted: boolean; renamed: boolean }>();
  let current: string | null = null;
  for (const line of text.split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      current = header[2]!;
      flags.set(current, { isNew: false, isDeleted: false, renamed: header[1] !== header[2] });
      continue;
    }
    if (!current) continue;
    const f = flags.get(current)!;
    if (line.startsWith("new file mode")) f.isNew = true;
    if (line.startsWith("deleted file mode")) f.isDeleted = true;
    if (line.startsWith("rename from")) f.renamed = true;
  }
  const files: DiffFile[] = [];
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [a, r, rawPath] = line.split("\t");
    if (!rawPath) continue;
    const path = resolveRename(rawPath);
    const f = flags.get(path) ?? { isNew: false, isDeleted: false, renamed: rawPath !== path };
    files.push({ path, added: a === "-" ? 0 : Number(a), removed: r === "-" ? 0 : Number(r), ...f });
  }
  return { text, files, added: files.reduce((n, f) => n + f.added, 0), removed: files.reduce((n, f) => n + f.removed, 0) };
}

/** `dir/{old => new}.ts` or `old => new` as numstat prints a rename, to the new path. */
function resolveRename(path: string): string {
  const braces = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path);
  if (braces) return `${braces[1]}${braces[3]}${braces[4]}`.replace("//", "/");
  const arrow = /^(.*) => (.*)$/.exec(path);
  return arrow ? arrow[2]! : path;
}

export interface CheckContext {
  incidentId: string;
  flag: string | null;
  /** The app's folder inside the repository, "" when it is the repository. */
  projectDir: string;
  /** Line count of every file in the diff after the change, by repository path. */
  fileLengths: Record<string, number>;
}

export interface CheckResult {
  passed: boolean;
  findings: string[];
  counts: { files: number; added: number; removed: number; newFiles: number };
}

const DEPENDENCY_FILES = new Set(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc"]);
const CONFIG_FILE = /(^|\/)(tsconfig[^/]*\.json|eslint\.config\.[cm]?js|vite\.config\.[cm]?ts|vitest\.config\.[cm]?ts|playwright\.config\.[cm]?ts)$/;
const WORKFLOW = /^\.github\//;
const TEST_FILE = /(^|\/)(test|verification)\/.*\.(test|spec)\.ts$/;
const WEAKENED = /\b(it|test|describe)\.(skip|only)\(|\bx(it|test|describe)\(/;
const CONSTRAINT = /\b(CHECK \(|UNIQUE|NOT NULL|CONSTRAINT|PRIMARY KEY|REFERENCES)\b/;
const IN_MEMORY_STATE = /^(const|let|var) \w+\s*(:[^=]+)?= new (Set|Map)\b/;
const SLEEP = /\b(sleep|setTimeout|setInterval)\(/;

interface Hunk {
  path: string;
  added: string[];
  removed: string[];
}

function hunksOf(text: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  for (const line of text.split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      current = { path: header[2]!, added: [], removed: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) current.added.push(line.slice(1));
    else if (line.startsWith("-")) current.removed.push(line.slice(1));
  }
  return hunks;
}

export function checkDiff(diff: Diff, ctx: CheckContext): CheckResult {
  const findings: string[] = [];
  const prefix = ctx.projectDir ? `${ctx.projectDir}/` : "";
  const local = (path: string) => (path.startsWith(prefix) ? path.slice(prefix.length) : path);
  const reproPath = `apps/sample/test/incident-${ctx.incidentId}.test.ts`;

  if (!diff.files.some((f) => local(f.path) === reproPath && f.isNew)) {
    findings.push(`review 1: no reproduction test was added at ${reproPath}`);
  }

  for (const f of diff.files) {
    const path = local(f.path);
    const base = path.split("/").at(-1)!;
    if (DEPENDENCY_FILES.has(base)) findings.push(`review 4: ${path} is changed; a dependency or workspace change is a decision for a person`);
    else if (CONFIG_FILE.test(path) || WORKFLOW.test(path)) findings.push(`simple 9: ${path} is config and a fix does not touch it`);
    if (f.isDeleted && TEST_FILE.test(path)) findings.push(`review 5: ${path} was deleted`);
    if (f.renamed) findings.push(`simple 7: ${path} was renamed or moved`);
    const length = ctx.fileLengths[f.path] ?? ctx.fileLengths[path];
    if (!f.isDeleted && length !== undefined && length > 200) findings.push(`simple 8: ${path} is ${length} lines after the change; the pull request must explain it`);
  }

  const hunks = hunksOf(diff.text);
  for (const hunk of hunks) {
    const path = local(hunk.path);
    const isTest = TEST_FILE.test(path);
    for (const line of hunk.added) {
      if (isTest && WEAKENED.test(line)) findings.push(`review 5: ${path} adds a skipped or exclusive test: ${line.trim()}`);
      if (!isTest && SLEEP.test(line)) findings.push(`review 9: ${path} adds a wait: ${line.trim()}`);
      if (!isTest && IN_MEMORY_STATE.test(line.trim())) findings.push(`review 9: ${path} adds in-process state: ${line.trim()}`);
      if (redact(line) !== line) findings.push(`review 10: ${path} adds what looks like a secret or an address: ${redact(line).trim()}`);
    }
    for (const line of hunk.removed) {
      if (isTest && /^\s*expect\(/.test(line)) findings.push(`review 5: ${path} removes an assertion: ${line.trim()}`);
      if (!isTest && CONSTRAINT.test(line)) findings.push(`review 8: ${path} removes a database constraint: ${line.trim()}`);
    }
  }

  if (ctx.flag) {
    const branchRemoved = hunks.some((h) => h.removed.some((l) => l.includes(`bugs.has("${ctx.flag}")`)));
    const entryRetired = hunks.some((h) => local(h.path).endsWith("flags.ts") && h.added.some((l) => l.includes(`fixedBy: "${ctx.incidentId}"`)));
    if (branchRemoved && !entryRetired) findings.push(`simple 6: the ${ctx.flag} branch is gone but its entry in apps/sample/src/server/flags.ts is not marked fixedBy: "${ctx.incidentId}"`);
  }

  return {
    passed: findings.length === 0,
    findings,
    counts: { files: diff.files.length, added: diff.added, removed: diff.removed, newFiles: diff.files.filter((f) => f.isNew).length },
  };
}

export type GateKind = "review" | "simple";

export interface Verdict {
  passed: boolean;
  rule: number | null;
  reason: string | null;
}

const VERDICTS: Record<GateKind, { pass: RegExp; fail: RegExp; hint: string }> = {
  review: { pass: /^APPROVED\b/m, fail: /^REFUSED:\s*(\d+)\s*[—-]\s*(.+)$/m, hint: "APPROVED or REFUSED: n — reason" },
  simple: { pass: /^SIMPLE\b/m, fail: /^NOT SIMPLE:\s*(\d+)\s*[—-]\s*(.+)$/m, hint: "SIMPLE or NOT SIMPLE: n — reason" },
};

/** Reads the verdict line the skill asks for. No line is a refusal: a gate that cannot find its answer does not pass. */
export function parseVerdict(kind: GateKind, text: string): Verdict {
  const { pass, fail, hint } = VERDICTS[kind];
  const failed = fail.exec(text);
  if (failed) return { passed: false, rule: Number(failed[1]), reason: failed[2]!.trim() };
  if (pass.test(text)) return { passed: true, rule: null, reason: null };
  return { passed: false, rule: null, reason: `no verdict line (${hint})` };
}
