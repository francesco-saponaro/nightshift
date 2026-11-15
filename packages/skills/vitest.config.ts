import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "skills",
    include: ["test/**/*.test.ts"],
  },
});
