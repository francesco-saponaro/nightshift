import { defineConfig } from "@playwright/test";

// The verification scenarios. They run against the built app on a port of their own, with whatever SAMPLE_BUGS says
// switched on, so the same scenarios prove a bug (it fails) and prove its fix (it passes).
const port = Number(process.env.SAMPLE_PORT ?? 3900);

export default defineConfig({
  testDir: "verification",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "vite build --logLevel warn && tsx src/server/main.ts",
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    env: { PORT: String(port), SAMPLE_BUGS: process.env.SAMPLE_BUGS ?? "" },
    timeout: 60_000,
  },
});
