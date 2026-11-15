import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@nightshift/skills": resolve(import.meta.dirname, "../../packages/skills/src/index.ts"),
      "@nightshift/sample/flags": resolve(import.meta.dirname, "../sample/src/server/flags.ts"),
    },
  },
  test: {
    name: "agent",
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
