import { describe, expect, it } from "vitest";
import { checkDiff, parseDiff, parseVerdict, type DiffFile } from "../src/pipeline/gates.js";

const goodDiff = `diff --git a/apps/sample/src/server/app.ts b/apps/sample/src/server/app.ts
--- a/apps/sample/src/server/app.ts
+++ b/apps/sample/src/server/app.ts
@@ -24,9 +24,7 @@
-const looseTitle = z.string().max(200);
-    title: bugs.has("empty-title") ? looseTitle : strictTitle,
+    title: strictTitle,
diff --git a/apps/sample/src/server/flags.ts b/apps/sample/src/server/flags.ts
--- a/apps/sample/src/server/flags.ts
+++ b/apps/sample/src/server/flags.ts
@@ -20,2 +20,3 @@
     trigger: "POST /api/todos with { title: "" }",
+    fixedBy: "inc-f42f2815",
   },
diff --git a/apps/sample/test/incident-inc-f42f2815.test.ts b/apps/sample/test/incident-inc-f42f2815.test.ts
new file mode 100644
--- /dev/null
+++ b/apps/sample/test/incident-inc-f42f2815.test.ts
@@ -0,0 +1,3 @@
+import { it } from "vitest";
+it("answers 400", async () => {});
+// end
`;

const numstat = `2\t3\tapps/sample/src/server/app.ts
1\t0\tapps/sample/src/server/flags.ts
3\t0\tapps/sample/test/incident-inc-f42f2815.test.ts
`;

function withFile(path: string, added: string[], removed: string[] = []): string {
  return `${goodDiff}diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1,1 +1,1 @@
${removed.map((l) => `-${l}`).join("\n")}
${added.map((l) => `+${l}`).join("\n")}
`;
}

const lengths = (files: DiffFile[]) => Object.fromEntries(files.map((f) => [f.path, 100]));

describe("parseDiff", () => {
  it("lists the files with their counts and whether they are new", () => {
    const diff = parseDiff(goodDiff, numstat);
    expect(diff.files.map((f) => f.path)).toEqual(["apps/sample/src/server/app.ts", "apps/sample/src/server/flags.ts", "apps/sample/test/incident-inc-f42f2815.test.ts"]);
    expect(diff.files[2]).toMatchObject({ added: 3, removed: 0, isNew: true });
    expect(diff.added).toBe(6);
    expect(diff.removed).toBe(3);
  });
});

describe("checkDiff, the mechanical part of the review", () => {
  const ctx = { incidentId: "inc-f42f2815", flag: "empty-title", projectDir: "" };

  it("passes a fix that removes the flagged path, retires its flag entry, and adds the reproduction", () => {
    const diff = parseDiff(goodDiff, numstat);
    const result = checkDiff(diff, { ...ctx, fileLengths: lengths(diff.files) });
    expect(result.findings).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.counts).toEqual({ files: 3, added: 6, removed: 3, newFiles: 1 });
  });

  it("refuses a diff without the reproduction test", () => {
    const diff = parseDiff(goodDiff.split("diff --git a/apps/sample/test")[0]!, numstat.split("\n").slice(0, 2).join("\n"));
    const result = checkDiff(diff, { ...ctx, fileLengths: lengths(diff.files) });
    expect(result.passed).toBe(false);
    expect(result.findings.join("\n")).toMatch(/review 1: .*incident-inc-f42f2815\.test\.ts/);
  });

  it("refuses a touched dependency, lockfile, config or workflow", () => {
    for (const path of ["apps/sample/package.json", "pnpm-lock.yaml", "tsconfig.base.json", "eslint.config.js", ".github/workflows/ci.yml", "apps/sample/vite.config.ts"]) {
      const text = withFile(path, ['"x": 1']);
      const diff = parseDiff(text, `${numstat}1\t0\t${path}\n`);
      const result = checkDiff(diff, { ...ctx, fileLengths: lengths(diff.files) });
      expect(result.findings.join("\n"), path).toMatch(/review 4|simple 9/);
    }
  });

  it("refuses a weakened test, a dropped constraint, a sleep and a secret", () => {
    const cases: [string, string[], string[], RegExp][] = [
      ["apps/sample/test/api.test.ts", ['  it.skip("x", () => {});'], [], /review 5/],
      ["apps/sample/test/api.test.ts", ['  it.only("x", () => {});'], [], /review 5/],
      ["apps/sample/test/api.test.ts", [], ['    expect(res.statusCode).toBe(400);'], /review 5/],
      ["apps/sample/src/server/store.ts", [], ["  title text NOT NULL CONSTRAINT todos_title_not_blank CHECK (btrim(title) <> ''),"], /review 8/],
      ["apps/sample/src/server/store.ts", ["      await sleep(50);"], [], /review 9/],
      ["apps/sample/src/server/store.ts", ["const inFlight = new Set<string>();"], [], /review 9/],
      ["apps/sample/src/server/app.ts", ['const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";'], [], /review 10/],
      ["apps/sample/test/incident-inc-f42f2815.test.ts", ['const who = "francesco@example.com";'], [], /review 10/],
    ];
    for (const [path, added, removed, expected] of cases) {
      const diff = parseDiff(withFile(path, added, removed), `${numstat}${added.length}\t${removed.length}\t${path}\n`);
      const result = checkDiff(diff, { ...ctx, fileLengths: lengths(diff.files) });
      expect(result.findings.join("\n"), `${path}: ${added.join("|")}${removed.join("|")}`).toMatch(expected);
    }
  });

  it("refuses a deleted test file, a renamed file and a file left over 200 lines", () => {
    const deleted = `${goodDiff}diff --git a/apps/sample/test/dates.test.ts b/apps/sample/test/dates.test.ts
deleted file mode 100644
--- a/apps/sample/test/dates.test.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-import { it } from "vitest";
-it("x", () => {});
`;
    let diff = parseDiff(deleted, `${numstat}0\t2\tapps/sample/test/dates.test.ts\n`);
    expect(checkDiff(diff, { ...ctx, fileLengths: lengths(diff.files) }).findings.join("\n")).toMatch(/review 5: .*dates\.test\.ts/);

    const renamed = `${goodDiff}diff --git a/apps/sample/src/server/dates.ts b/apps/sample/src/server/days.ts
similarity index 100%
rename from apps/sample/src/server/dates.ts
rename to apps/sample/src/server/days.ts
`;
    diff = parseDiff(renamed, `${numstat}0\t0\tapps/sample/src/server/{dates.ts => days.ts}\n`);
    expect(checkDiff(diff, { ...ctx, fileLengths: lengths(diff.files) }).findings.join("\n")).toMatch(/simple 7/);

    diff = parseDiff(goodDiff, numstat);
    const long = checkDiff(diff, { ...ctx, fileLengths: { ...lengths(diff.files), "apps/sample/src/server/app.ts": 231 } });
    expect(long.findings.join("\n")).toMatch(/simple 8: .*app\.ts.*231 lines/);
  });

  it("refuses a diff that removes a flag's branch without marking its entry fixed", () => {
    const text = goodDiff.split("diff --git a/apps/sample/src/server/flags.ts")[0] + goodDiff.slice(goodDiff.indexOf("diff --git a/apps/sample/test"));
    const diff = parseDiff(text, numstat.split("\n").filter((l) => !l.includes("flags.ts")).join("\n"));
    const result = checkDiff(diff, { ...ctx, fileLengths: lengths(diff.files) });
    expect(result.findings.join("\n")).toMatch(/simple 6: .*flags\.ts/);
  });

  it("prefixes paths with the project folder when the app lives in a subfolder", () => {
    const prefixed = goodDiff.replaceAll("a/apps/", "a/projects/nightshift/apps/").replaceAll("b/apps/", "b/projects/nightshift/apps/");
    const diff = parseDiff(prefixed, numstat.replaceAll("\tapps/", "\tprojects/nightshift/apps/"));
    const result = checkDiff(diff, { ...ctx, projectDir: "projects/nightshift", fileLengths: lengths(diff.files) });
    expect(result.findings).toEqual([]);
  });
});

describe("parseVerdict", () => {
  it("reads the review verdict line", () => {
    expect(parseVerdict("review", "Checked every line.\n\nAPPROVED\n- 13: a comment repeats the line")).toEqual({ passed: true, rule: null, reason: null });
    expect(parseVerdict("review", "REFUSED: 2 — the 500 is caught and relabelled")).toEqual({ passed: false, rule: 2, reason: "the 500 is caught and relabelled" });
  });

  it("reads the simplicity verdict line", () => {
    expect(parseVerdict("simple", "SIMPLE — 3 files, +5 −6")).toEqual({ passed: true, rule: null, reason: null });
    expect(parseVerdict("simple", "NOT SIMPLE: 2 — a helper used once")).toEqual({ passed: false, rule: 2, reason: "a helper used once" });
  });

  it("treats a missing verdict as a refusal, never as a pass", () => {
    expect(parseVerdict("review", "Looks fine to me!")).toEqual({ passed: false, rule: null, reason: "no verdict line (APPROVED or REFUSED: n — reason)" });
  });
});
