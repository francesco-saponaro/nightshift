import { readdir } from "node:fs/promises";
import { chooseAgent } from "./agent/select.js";
import { secretsFromEnv } from "./agent/redact.js";
import { buildAgentApp } from "./app.js";
import { fixtureFor, readConfig } from "./config.js";
import { migrate, openDb } from "./db.js";
import { runIncident } from "./pipeline/run.js";
import { findRepo } from "./pipeline/worktree.js";
import { enqueueIncident, openQueue, workIncidents } from "./queue.js";
import { makeStore } from "./store.js";

/**
 * The Nightshift process: the webhook server and the worker in one, sharing a database and a queue. Without an API key
 * it runs in dry-run mode and says so on /health and in the log: incidents are real, the agent is replayed.
 */
const config = readConfig();
const db = await openDb(config.databaseUrl);
await migrate(db);
const store = makeStore(db);
const boss = await openQueue(db);
const repo = await findRepo(config.projectRoot);
const mode = config.hasAgentKey ? "live" : "dry-run";
const fixtures = (await readdir(config.fixturesDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

if (!config.sentrySecret && !config.posthogSecret) {
  console.warn("Neither SENTRY_CLIENT_SECRET nor POSTHOG_WEBHOOK_SECRET is set: both webhook endpoints will refuse every delivery.");
}
// gh reads its token from GH_TOKEN; it is passed to that one child process and never written anywhere.
const ghEnv = process.env["GH_TOKEN"] ? { GH_TOKEN: process.env["GH_TOKEN"] } : {};

const app = await buildAgentApp({
  store,
  secrets: { sentry: config.sentrySecret, posthog: config.posthogSecret },
  enqueue: (job) => enqueueIncident(boss, job),
  mode,
  sandbox: Boolean(config.sandboxUrl),
  pullRequests: config.pullRequests ? { label: config.pullRequests.label, autoMerge: config.pullRequests.autoMerge } : null,
  logger: true,
});

await workIncidents(boss, async (job) => {
  const row = await store.getIncident(job.incidentId);
  if (!row) {
    app.log.error({ job }, "queued run for an incident that is not stored");
    return;
  }
  const { agent } = await chooseAgent({ fixtureDir: fixtureFor(row.incident.flag, config.fixturesDir, fixtures) });
  app.log.info({ runId: job.runId, incident: job.incidentId, agent: agent.name, mode }, "run starting");
  const outcome = await runIncident(row.incident, {
    store,
    agent,
    mode,
    repo,
    worktreesDir: config.worktreesDir,
    install: config.install,
    secrets: secretsFromEnv(),
    // Once the branch is pushed the worktree has done its job; without a pull request it stays for a person to look at.
    keepWorktree: !config.pullRequests,
    pullRequest: config.pullRequests && { ...config.pullRequests, env: ghEnv },
    runId: job.runId,
    log: (line) => app.log.info({ runId: job.runId }, line),
  });
  app.log.info({ runId: job.runId, status: outcome.status, failedStep: outcome.failedStep }, "run finished");
});

await app.listen({ port: config.port, host: config.host });
app.log.info({ mode, database: db.kind, repo, worktrees: config.worktreesDir, fixtures, pullRequests: config.pullRequests ? { label: config.pullRequests.label, autoMerge: config.pullRequests.autoMerge } : "off" }, "nightshift up");

const stop = async () => {
  await boss.stop({ graceful: true, timeout: 5000 });
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
