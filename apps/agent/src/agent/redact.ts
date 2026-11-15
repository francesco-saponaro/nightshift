/**
 * Scrubs a transcript before it is stored or shown. The agent reads the repository, the environment and the incident,
 * any of which can hold a key, a token or a person's address; none of that belongs in the run's record.
 */
const PATTERNS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]{10,}/g, "[redacted]"],
  [/(ANTHROPIC_API_KEY|SENTRY_CLIENT_SECRET|POSTHOG_WEBHOOK_SECRET|NETLIFY_AUTH_TOKEN|GH_TOKEN|GITHUB_TOKEN|GH_PAT)\s*[=:]\s*\S+/g, "$1=[redacted]"],
  [/(Authorization:\s*Bearer)\s+\S+/gi, "$1 [redacted]"],
  [/(Authorization:\s*Basic)\s+\S+/gi, "$1 [redacted]"],
  [/((?:Set-)?Cookie:\s*)[^\n]+/gi, "$1[redacted]"],
  [/(x-api-key:\s*)\S+/gi, "$1[redacted]"],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]"],
  [/github_pat_[A-Za-z0-9_]{20,}/g, "[redacted]"],
  [/AKIA[0-9A-Z]{16}/g, "[redacted]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[redacted]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
];

export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 6) out = out.replaceAll(secret, "[redacted]");
  }
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** The secrets a run should scrub wherever they appear, read from the environment once. */
export function secretsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return ["ANTHROPIC_API_KEY", "SENTRY_CLIENT_SECRET", "POSTHOG_WEBHOOK_SECRET", "GH_TOKEN", "GITHUB_TOKEN"].map((k) => env[k]).filter((v): v is string => Boolean(v));
}
