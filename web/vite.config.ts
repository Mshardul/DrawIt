import { defineConfig } from "vitest/config";

export default defineConfig({
  // The Go binary embeds this folder (internal/webui).
  build: { outDir: "../internal/webui/dist/app", emptyOutDir: true },
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
