import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The packs sit outside the app folder, so the dev server does not watch them unless told to. Watching them
// lets the bundled pack list, and the catalogue page, follow files that are added, changed or removed.
const packs = fileURLToPath(new URL("../packs", import.meta.url));

export default defineConfig({
  plugins: [{ name: "watch-packs", configureServer: (server) => { server.watcher.add(packs); } }],
  // The Go binary embeds this folder (internal/webui).
  // Never inline assets: the server's CSP allows only same-origin files, so a data: font would be blocked.
  build: { outDir: "../internal/webui/dist/app", emptyOutDir: true, assetsInlineLimit: 0 },
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
