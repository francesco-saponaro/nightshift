import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chooseAgent } from "./agent/select.js";
import { secretsFromEnv } from "./agent/redact.js";
import { readConfig } from "./config.js";
import { migrate, openDb } from "./db.js";
import { runIncident } from "./pipeline/run.js";
import { findRepo } from "./pipeline/worktree.js";
import { makeStore } from "./store.js";
import { parsePostHog } from "./webhooks/posthog.js";
import { parseSentry } from "./webhooks/sentry.js";

/**
 * Runs one fixture through the pipeline from the command line, no server, no queue:
 *
 *   pnpm -C apps/agent run-fixture empty-title            # dry run: the recorded agent, the default verification
 *   pnpm -C apps/agent run-fixture empty-title --quick    # unit tests only in the verification step
 *   pnpm -C apps/agent run-fixture empty-title --keep     # leave the worktree and branch in place to look at
 *   pnpm -C apps/agent run-fixture empty-title --out fixtures/empty-title   # also write events.json and verification.log there
 *
 * With ANTHROPIC_API_KEY set the live agent runs instead of the transcript. Prints every event as it happens and the
 * outcome at the end; exits 1 when the run fails.
 */
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    quick: { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    out: { type: "string" },
  },
});
const name = positionals[0];
if (!name) {
  console.error("usage: run-fixture <fixture> [--quick] [--keep] [--dry-run]");
  process.exit(2);
}

const config = readConfig();
const fixtureDir = join(config.fixturesDir, name);
const payload: unknown = JSON.parse(await readFile(join(fixtureDir, "webhook.json"), "utf8"));
const incident = (payload as { action?: string }).action ? parseSentry(payload) : parsePostHog(payload);

const db = await openDb(config.databaseUrl);
await migrate(db);
const store = makeStore(db);
await store.saveIncident(incident, payload);
const { agent, mode, reason } = await chooseAgent({ fixtureDir, forceDryRun: values["dry-run"] });
console.log(`${incident.id}: ${incident.title}\nmode ${mode} (${reason}), agent ${agent.name}\n`);

const outcome = await runIncident(incident, {
  store,
  agent,
  mode,
  repo: await findRepo(config.projectRoot),
  worktreesDir: config.worktreesDir,
  install: config.install,
  verification: values.quick ? ["pnpm -C apps/sample test"] : null,
  secrets: secretsFromEnv(),
  keepWorktree: values.keep,
  log: (line) => console.log(line),
});

if (values.out) {
  // The run's record, with this machine's paths taken out, so it can sit in the repository as a fixture.
  const repo = await findRepo(config.projectRoot);
  const projectInWorktree = repo.projectDir ? join(config.worktreesDir, outcome.runId, repo.projectDir) : join(config.worktreesDir, outcome.runId);
  const neutral = (text: string) =>
    text
      .replaceAll(projectInWorktree, "<worktree>")
      .replaceAll(config.worktreesDir, "<worktrees>")
      .replaceAll(repo.repoRoot, "<repo>")
      .replaceAll(repo.projectDir ? `${repo.projectDir}/` : "\u0000", "")
      .replaceAll(`"projectDir": "${repo.projectDir}"`, '"projectDir": ""');
  const out = resolve(config.projectRoot, values.out);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "events.json"), neutral(JSON.stringify(outcome.events, null, 2)) + "\n");
  const verification = outcome.events
    .filter((e) => e.step === "verify" && typeof e.data["command"] === "string")
    .map((e) => `$ ${e.data["command"]}\n# exit ${e.data["code"]} after ${((e.data["durationMs"] as number) / 1000).toFixed(1)}s\n${String(e.data["output"]).trim()}\n`)
    .join("\n");
  await writeFile(join(out, "verification.log"), neutral(verification));
  console.log(`\nwrote ${join(out, "events.json")} and ${join(out, "verification.log")}`);
}

console.log(`\n${outcome.status}${outcome.failedStep ? ` at ${outcome.failedStep}: ${outcome.reason}` : ""}`);
if (outcome.counts) console.log(`diff: ${outcome.counts.files} files, +${outcome.counts.added} −${outcome.counts.removed}`);
if (outcome.worktreeDir) console.log(`worktree kept at ${outcome.worktreeDir} on ${outcome.branch}`);
await db.close();
process.exit(outcome.status === "fixed" ? 0 : 1);
