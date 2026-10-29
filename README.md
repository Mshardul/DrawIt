# DrawIt

A local-only, canvas-first diagram and infographic tool. It runs as a web app in any desktop browser, served by a single local Go binary, and saves diagrams as readable `.drawit.kdl` text files that diff cleanly. Nothing leaves your machine.

DrawIt is the internal working name; the public name is chosen before public release.

## Status

Under construction. Work is tracked in [docs/tickets.md](docs/tickets.md).

## Documentation

- [docs/File Format Spec v1.md](docs/File%20Format%20Spec%20v1.md): what DrawIt does and the file format.
- [docs/decisions.md](docs/decisions.md): why it works this way, and what was rejected.
- [docs/tickets.md](docs/tickets.md): the work, in dependency order.

## Vendor icons

AWS, GCP, Azure and other vendor icon sets are not bundled. Each has its own licence terms. Shipped templates, themes and shape packs are CC0.

## Layout

| Path | Contents |
|---|---|
| `web/` | TypeScript app (Vite, no UI framework; the renderer is our own SVG), Vitest unit tests, Playwright tests in `web/e2e/` |
| `cmd/`, `internal/` | Go module for the local server |
| `docs/` | Spec, decisions and tickets |
| `.github/workflows/` | CI |

## Development

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
```

A ticket is done when all its tests pass.

## Licence

AGPL-3.0, see [LICENSE](LICENSE). Contributions are AGPL-3.0; there is no contributor licence agreement. Diagrams you make belong to you.
