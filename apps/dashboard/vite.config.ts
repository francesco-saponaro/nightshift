import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * VITE_DEMO=1 builds the dashboard against the recorded runs in fixtures/, so the published demo works with no server
 * and no keys. Without it the dashboard reads the agent's API, proxied here in development.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@agent": resolve(import.meta.dirname, "../agent/src"),
      "@fixtures": resolve(import.meta.dirname, "../../fixtures"),
      "@skills": resolve(import.meta.dirname, "../../packages/skills/skills"),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:4000", rewrite: (path) => path.replace(/^\/api/, "") } },
  },
});
