import { defineConfig } from "vitest/config";

export default defineConfig({
  // The Go binary embeds this folder (internal/webui).
  // Never inline assets: the server's CSP allows only same-origin files, so a data: font would be blocked.
  build: { outDir: "../internal/webui/dist/app", emptyOutDir: true, assetsInlineLimit: 0 },
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
