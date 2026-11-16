import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// The screens are tested against the recorded runs, the way the published demo shows them.
process.env["VITE_DEMO"] = "1";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: "dashboard",
      include: ["test/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["test/setup.ts"],
    },
  }),
);
