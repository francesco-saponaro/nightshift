import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Everything Nightshift reads from the environment, in one place, with what each unset value means. */
export interface Config {
  port: number;
  host: string;
  databaseUrl: string | undefined;
  sentrySecret: string;
  posthogSecret: string;
  hasAgentKey: boolean;
  /** How pull requests are opened; null leaves the branch in the worktree and records the body on the run. */
  pullRequests: { label: string; autoMerge: boolean; author: { name: string; email: string } } | null;
  sandboxUrl: string | undefined;
  install: string;
  worktreesDir: string;
  fixturesDir: string;
  /** The folder with pnpm-workspace.yaml, apps/ and fixtures/: the app Nightshift looks after lives under it. */
  projectRoot: string;
}

const on = (value: string | undefined) => value !== undefined && value !== "" && value !== "0" && value.toLowerCase() !== "false";

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    port: Number(env["PORT"] ?? 4000),
    host: env["HOST"] ?? "127.0.0.1",
    databaseUrl: env["DATABASE_URL"] || undefined,
    sentrySecret: env["SENTRY_CLIENT_SECRET"] ?? "",
    posthogSecret: env["POSTHOG_WEBHOOK_SECRET"] ?? "",
    hasAgentKey: Boolean(env["ANTHROPIC_API_KEY"]),
    pullRequests: on(env["NIGHTSHIFT_OPEN_PR"])
      ? {
          label: env["NIGHTSHIFT_PR_LABEL"] || "nightshift",
          autoMerge: on(env["NIGHTSHIFT_AUTO_MERGE"]),
          author: { name: env["NIGHTSHIFT_GIT_NAME"] || "Nightshift", email: env["NIGHTSHIFT_GIT_EMAIL"] || "nightshift@localhost" },
        }
      : null,
    sandboxUrl: env["NIGHTSHIFT_SANDBOX_URL"] || undefined,
    install: env["NIGHTSHIFT_INSTALL"] ?? "pnpm install --frozen-lockfile --prefer-offline",
    worktreesDir: env["NIGHTSHIFT_WORKTREES"] ?? join(here, "..", "worktrees"),
    fixturesDir: env["NIGHTSHIFT_FIXTURES"] ?? join(here, "..", "..", "..", "fixtures"),
    projectRoot: join(here, "..", "..", ".."),
  };
}

/** The fixture a dry run replays for an incident: the one recorded for its flag, or the first one. */
export function fixtureFor(flag: string | null, fixturesDir: string, known: string[] = ["empty-title"]): string {
  const name = flag && known.includes(flag) ? flag : known[0]!;
  return join(fixturesDir, name);
}
