# DrawIt

Draw on a canvas. Keep it as text.

DrawIt is a local-only diagram and infographic tool. You draw with the mouse in your browser, and every diagram is saved as a readable `.drawit.kdl` text file that diffs cleanly in git. Nothing leaves your machine.

[Download](https://github.com/Mshardul/DrawIt/releases/latest) · [Website](https://mshardul.github.io/DrawIt/) · [Report an issue](https://github.com/Mshardul/DrawIt/issues)

## Why DrawIt

- **Canvas first.** Place things where you want them, to the pixel. The file stores the positions, so a diagram looks the same tomorrow as today.
- **Diagram as code.** Files are plain text. Review them in a pull request, hand-edit them, or generate them with a script or an LLM.
- **Local only.** One small program on your computer, with no network requests at runtime. Diagrams you make belong to you.

## Features

- Infinite canvas with pan, zoom, grid and snapping.
- Shapes from a library of shape packs, with labels typed straight into them, and images pasted or dragged in.
- Connectors that stay attached, with straight or elbow routing, bend points, arrowheads and labels.
- Text and shape styling: fonts, colours, fill, stroke, dash, corner radius and opacity.
- Align, distribute, lock, duplicate, undo and redo.
- Projects and files: a library of project folders, or open any folder or file from the command line. Autosave included.

## Install

DrawIt ships as a single binary. macOS is first; Linux and Windows builds follow.

1. Download the latest build from the [releases page](https://github.com/Mshardul/DrawIt/releases/latest).
2. The binary is not signed yet, so macOS blocks the first launch. Clear the quarantine flag once:

   ```sh
   xattr -d com.apple.quarantine ./drawit
   chmod +x ./drawit
   ```

3. Run it. Your browser opens on the canvas.

   ```sh
   ./drawit              # start screen with your projects
   ./drawit ~/diagrams   # open a folder
   ```

Options: `-addr 127.0.0.1:PORT` picks the port, and `-no-browser` skips opening the browser. DrawIt listens on 127.0.0.1 only.

## The file format

```kdl
diagram version=1 title="Order flow" {
  plugins core@1 arch@1
}

node api "API Gateway" shape=arch.gateway
node orders "Order Service" shape=arch.server
node db "Orders DB" shape=arch.database

edge api orders label="POST /orders"
edge orders db

layout {
  api    x=40  y=150 w=160 h=60
  orders x=280 y=150 w=180 h=60
  db     x=260 y=320
}
```

Every save writes the same canonical text, so a one-box change is a one-line diff. The full format is in [docs/File Format Spec v1.md](docs/File%20Format%20Spec%20v1.md).

## Vendor icons

AWS, GCP, Azure and other vendor icon sets are not bundled. Each has its own licence terms. Shipped templates, themes and shape packs are CC0.

## Contributing

Requires Node 24 or later, pnpm and Go 1.27 or later.

```sh
cd web
pnpm install
pnpm exec playwright install chromium firefox webkit
pnpm dev                 # Vite dev server
pnpm lint
pnpm typecheck
pnpm test                # Vitest
pnpm test:e2e            # Playwright: Chromium, Firefox, WebKit; frame-budget tests (@budget) run last, one at a time
E2E_BROWSERS=chromium,webkit pnpm test:e2e   # leave a browser out

cd ..
go test ./...
golangci-lint run

cd site
node --test              # website build tests
node build.mjs           # builds site/dist
```

| Path | Contents |
|---|---|
| `web/` | TypeScript app (Vite, no UI framework; the renderer is our own SVG), Vitest unit tests, Playwright tests in `web/e2e/` |
| `cmd/`, `internal/` | Go module for the local server |
| `site/` | The website, built to plain HTML and CSS and deployed to GitHub Pages |
| `docs/` | Spec, decisions and tickets |
| `.github/workflows/` | CI and Pages deploy |

Read [docs/decisions.md](docs/decisions.md) for why it works this way and what was rejected, and [docs/tickets.md](docs/tickets.md) for the work in dependency order.

## Licence

AGPL-3.0, see [LICENSE](LICENSE). Contributions are AGPL-3.0; there is no contributor licence agreement.
