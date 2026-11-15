import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sample",
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
