import type { Health } from "../api/types.js";
import { Pill } from "../components/pill.js";

/** Which integrations are configured and how pull requests open. Nothing is edited here: every value comes from the environment. */
export function SettingsScreen({ health }: { health: Health }) {
  const rows = [
    {
      name: "Sentry",
      description: "Issue alerts from an internal integration, signed with its client secret over the raw body.",
      on: health.integrations.sentry,
      detail: health.integrations.sentry ? "Deliveries to /webhooks/sentry are checked and queued." : "Set SENTRY_CLIENT_SECRET; until then every delivery to /webhooks/sentry is refused with 401.",
    },
    {
      name: "PostHog",
      description: "$exception events from a webhook destination, with the shared secret in x-nightshift-signature.",
      on: health.integrations.posthog,
      detail: health.integrations.posthog ? "Deliveries to /webhooks/posthog are checked and queued." : "Set POSTHOG_WEBHOOK_SECRET; until then every delivery to /webhooks/posthog is refused with 401.",
    },
    {
      name: "Coding agent",
      description: "The live agent through the Agent SDK, one session per run, in the run's own checkout.",
      on: health.integrations.agent,
      detail: health.integrations.agent ? "Live: the agent writes the reproduction and the fix itself." : "Dry run: the agent's turns are replayed from the recorded transcripts in fixtures/. Set ANTHROPIC_API_KEY for a live run.",
    },
    {
      name: "Sandbox",
      description: "A cloud sandbox for the checkout instead of a git worktree on this machine.",
      on: health.integrations.sandbox,
      detail: health.integrations.sandbox ? "Runs work in the sandbox at NIGHTSHIFT_SANDBOX_URL." : "Runs work in a git worktree under apps/agent/worktrees/. NIGHTSHIFT_SANDBOX_URL is read and, for now, unused.",
    },
  ];
  const pr = health.pullRequests;
  return (
    <article>
      <h1 className="text-[24px] leading-8 font-medium">Settings</h1>
      <p className="mt-1">
        Nightshift is running in {health.mode === "live" ? "live" : "dry-run"} mode. {rows.filter((r) => r.on).length} of {rows.length} integrations are configured; pull requests are {pr ? "opened" : "off"}.
      </p>
      {health.demo ? <p className="notice mt-4 inline-block">This is the published demo: it shows the recorded runs in fixtures/ and reads nothing live.</p> : null}
      <div className="mt-6 flex flex-col gap-4">
        {rows.map((r) => (
          <SettingRow key={r.name} name={r.name} description={r.description}>
            <div className="flex items-start gap-3">
              <Pill tone={r.on ? "positive" : "neutral"}>{r.on ? "Configured" : "Not configured"}</Pill>
              <p>{r.detail}</p>
            </div>
          </SettingRow>
        ))}
        <SettingRow name="Pull requests" description="The last step: the branch is pushed and a pull request opened with gh, labelled, with the run's record in the body.">
          <div className="flex items-start gap-3">
            <Pill tone={pr ? "positive" : "neutral"}>{pr ? "On" : "Off"}</Pill>
            <div>
              {pr ? (
                <p>
                  Opened under the label <span className="mono">{pr.label}</span>; auto-merge is {pr.autoMerge ? "on: a pull request merges itself when the checks are green" : "off: a person merges"}.
                </p>
              ) : (
                <p>Each run records the title and body it would have used and leaves the branch in its worktree. Set NIGHTSHIFT_OPEN_PR=1 to open them; NIGHTSHIFT_AUTO_MERGE=1 as well to let GitHub merge when the checks are green.</p>
              )}
            </div>
          </div>
        </SettingRow>
        <section className="panel mt-2" aria-label="Every variable Nightshift reads">
          <h2 className="text-base font-medium">Every variable Nightshift reads</h2>
          <p className="text-muted px-5 pt-1 text-[13px]">The same list as .env.example. Nothing here is required for a dry run, and no value is ever logged.</p>
          <div className="overflow-x-auto pt-2">
            <table className="data">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>What it does</th>
                  <th>When unset</th>
                </tr>
              </thead>
              <tbody>
                {VARIABLES.map((v) => (
                  <tr key={v.name}>
                    <td className="mono whitespace-nowrap">{v.name}</td>
                    <td>{v.what}</td>
                    <td className="text-muted">{v.unset}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </article>
  );
}

const VARIABLES: { name: string; what: string; unset: string }[] = [
  { name: "ANTHROPIC_API_KEY", what: "The coding agent, read by the Agent SDK and by nothing in this repository.", unset: "Dry run: the recorded transcripts are replayed." },
  { name: "SENTRY_CLIENT_SECRET", what: "Checks the signature on every Sentry delivery.", unset: "Every Sentry delivery is refused." },
  { name: "POSTHOG_WEBHOOK_SECRET", what: "Checks the signature on every PostHog delivery.", unset: "Every PostHog delivery is refused." },
  { name: "DATABASE_URL", what: "Where incidents, runs and the queue live: pglite:<dir> or postgres://…", unset: "PGlite in memory; a restart forgets everything." },
  { name: "NIGHTSHIFT_OPEN_PR", what: "Pushes each fixed branch and opens the pull request with gh.", unset: "The branch stays in its worktree; the body is recorded on the run." },
  { name: "NIGHTSHIFT_AUTO_MERGE", what: "With NIGHTSHIFT_OPEN_PR, asks GitHub to merge when the checks are green.", unset: "A person merges." },
  { name: "NIGHTSHIFT_PR_LABEL", what: "The label on every pull request.", unset: "nightshift" },
  { name: "NIGHTSHIFT_GIT_NAME, NIGHTSHIFT_GIT_EMAIL", what: "The author of the fix commit.", unset: "Nightshift <nightshift@localhost>" },
  { name: "GH_TOKEN", what: "Passed to gh for the pull request, and to nothing else.", unset: "gh uses its own sign-in." },
  { name: "NIGHTSHIFT_SANDBOX_URL", what: "A cloud sandbox for the checkout.", unset: "A git worktree on this machine." },
  { name: "NIGHTSHIFT_INSTALL", what: "How a worktree gets its dependencies.", unset: "pnpm install --frozen-lockfile --prefer-offline" },
  { name: "SAMPLE_BUGS", what: "The seeded bugs switched on in the sample app, comma-separated.", unset: "None: the sample app behaves." },
];

function SettingRow({ name, description, children }: { name: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6" aria-label={name}>
      <div>
        <h2 className="text-base font-medium">{name}</h2>
        <p className="text-muted mt-1 text-[13px]">{description}</p>
      </div>
      <div className="panel px-5 py-4">{children}</div>
    </section>
  );
}
