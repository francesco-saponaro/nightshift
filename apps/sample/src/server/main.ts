import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { parseBugs } from "./flags.js";
import { consoleReporter, webhookReporter } from "./report.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/server/main.js at run time, src/server/main.ts under tsx; dist/web sits beside either.
const webDir = [join(here, "..", "web"), join(here, "..", "..", "dist", "web")].find((d) => existsSync(join(d, "index.html")));

const bugs = parseBugs(process.env.SAMPLE_BUGS);
const release = `sample@${process.env.npm_package_version ?? "0.1.0"}`;
const reportUrl = process.env.SAMPLE_REPORT_URL;
const report = reportUrl ? webhookReporter({ url: reportUrl, secret: process.env.SENTRY_CLIENT_SECRET ?? "", release }) : consoleReporter;

const app = await buildApp({ bugs, report, logger: true, ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}) });

if (webDir) {
  await app.register(fastifyStatic, { root: webDir, wildcard: false });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) return reply.status(404).send({ error: "not_found" });
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
await app.listen({ port, host });
app.log.info({ bugs: [...bugs], web: webDir ?? "none (API only)", reportUrl: reportUrl ?? "console" }, "sample app up");
