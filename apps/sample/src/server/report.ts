import { createHmac } from "node:crypto";

/** What the API's error handler knows about a 500 when it happens. */
export interface ReportedError {
  name: string;
  message: string;
  stack: string | undefined;
  request: { method: string; url: string; body?: unknown };
  bugs: string[];
  at: Date;
}

export type Reporter = (error: ReportedError) => Promise<void> | void;

export interface SentryFrame {
  filename: string;
  function: string;
  lineno: number;
  colno: number;
  in_app: boolean;
}

/** The shape of Sentry's issue-alert webhook ("event_alert" resource), trimmed to the fields Nightshift reads. */
export interface SentryWebhookEvent {
  action: "triggered";
  installation: { uuid: string };
  data: {
    event: {
      event_id: string;
      title: string;
      message: string;
      culprit: string;
      level: "error";
      platform: "node";
      release: string;
      timestamp: string;
      environment: string;
      tags: [string, string][];
      request: { method: string; url: string; data?: unknown };
      exception: { values: { type: string; value: string; stacktrace: { frames: SentryFrame[] } }[] };
      web_url: string;
    };
    triggered_rule: string;
  };
  actor: { type: "application"; id: "sentry"; name: "Sentry" };
}

const FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

export function parseFrames(stack: string | undefined): SentryFrame[] {
  const frames: SentryFrame[] = [];
  for (const line of (stack ?? "").split("\n")) {
    const m = FRAME.exec(line);
    if (!m) continue;
    const filename = m[2]!;
    frames.push({
      filename,
      function: m[1] ?? "<anonymous>",
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes("node_modules") && !filename.startsWith("node:"),
    });
  }
  // Sentry lists frames oldest first; a Node stack lists them newest first.
  return frames.reverse();
}

export function sentryEvent(error: ReportedError, release: string, environment = "production"): SentryWebhookEvent {
  const eventId = createHmac("sha256", "event").update(`${error.at.toISOString()}${error.message}`).digest("hex").slice(0, 32);
  return {
    action: "triggered",
    installation: { uuid: "sample-app" },
    data: {
      event: {
        event_id: eventId,
        title: error.message,
        message: error.message,
        culprit: `${error.request.method} ${error.request.url}`,
        level: "error",
        platform: "node",
        release,
        timestamp: error.at.toISOString(),
        environment,
        tags: [
          ["environment", environment],
          ["release", release],
          ["sample.bugs", error.bugs.join(",")],
          ["transaction", `${error.request.method} ${error.request.url}`],
        ],
        request: { method: error.request.method, url: error.request.url, ...(error.request.body !== undefined ? { data: error.request.body } : {}) },
        exception: { values: [{ type: error.name, value: error.message, stacktrace: { frames: parseFrames(error.stack) } }] },
        web_url: `https://sentry.example/organizations/sample/issues/${eventId}/`,
      },
      triggered_rule: "Every new error",
    },
    actor: { type: "application", id: "sentry", name: "Sentry" },
  };
}

export function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number }>;

export interface WebhookReporterOptions {
  url: string;
  secret: string;
  release: string;
  fetch?: FetchLike;
  warn?: (message: string) => void;
}

/**
 * Sends every 500 to a webhook the way Sentry would, signed with the same HMAC, so a demo can run the whole loop
 * without a Sentry account. Nothing it does can fail the request that is already failing.
 */
export function webhookReporter(options: WebhookReporterOptions): Reporter {
  const send: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const warn = options.warn ?? ((m) => console.warn(m));
  return async (error) => {
    const body = JSON.stringify(sentryEvent(error, options.release));
    try {
      const res = await send(options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "sentry-hook-resource": "event_alert",
          "sentry-hook-signature": signBody(body, options.secret),
        },
        body,
      });
      if (res.status >= 300) warn(`error report refused by ${options.url}: ${res.status}`);
    } catch (e) {
      warn(`error report to ${options.url} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}

export const consoleReporter: Reporter = (error) => {
  console.error(JSON.stringify({ level: "error", message: error.message, request: error.request, bugs: error.bugs, at: error.at.toISOString() }));
};
