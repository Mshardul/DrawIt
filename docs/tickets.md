# DrawIt — Tickets

One table, dependency-ordered phases, no dates promised (decision Q3, Q4). Tests are tagged with the ticket ID they verify; a ticket is done when all its tests pass (spec 7.3).

## Format

The table has one fixed set of columns and plain-text cells. Changing a column is a decision: update Q4 as well.

- **Columns:** ID, Phase, Title, Description, Depends on, Status, Created on, Updated on.
- **ID:** `T-NNN`, never reused.
- **Depends on:** comma-separated IDs, or `none`.
- **Status:** `todo`, `doing`, `done` or `blocked`.
- **Created on / Updated on:** `YYYY-MM-DD` and nothing else. Created on never changes; Updated on is the day any field last changed.
- **Cells:** plain text. No emoji, arrows or other symbols.

Phases 0 and 1 are broken into tickets. Later phases are outlined and get tickets as they come up.

## Phases

| Phase | Goal |
|---|---|
| 0 | Foundation: document model, KDL round-trip, formatter, commands, test harness. Four risk spikes: KDL parser, text wrapping, drag performance, connectors. |
| 1 | Minimal editor: local Go server (file access, security), SVG renderer, select, move, resize, save. |
| 2 | Connectors and text. |
| 3 | Styling and shape packs: one ticket per shape category, built in parallel from the shape standard (T-022). Category work can start before the renderer exists. |
| 4 | Workspace, files, file watching, preferences, clipboard, export. |
| 5 | Polish: performance budgets, in-app documentation, release. |

## Tickets

| ID | Phase | Title | Description | Depends on | Status | Created on | Updated on |
|---|---|---|---|---|---|---|---|
| T-001 | 0 | Project scaffold | TypeScript app and Go module, test runners, lint, CI. Test tagging by ticket ID works. Playwright runs in Chromium, Firefox and WebKit. | none | doing | 2026-10-25 | 2026-10-26 |
| T-002 | 0 | Document model types | Structure, style and layout types per spec 4.3–4.5, with no UI imports. | T-001 | todo | 2026-10-25 | 2026-10-25 |
| T-003 | 0 | KDL v2 reader | Parse a `.drawit.kdl` file into the model. Invalid files fail with line and column (E2). | T-002, T-017 | todo | 2026-10-25 | 2026-10-26 |
| T-004 | 0 | Canonical writer (formatter) | Write the model to canonical KDL: fixed section and property order, stable bytes (spec 4.6). | T-002 | todo | 2026-10-25 | 2026-10-25 |
| T-005 | 0 | Golden-file round-trip tests | Open then save reproduces canonical files byte for byte. | T-003, T-004 | todo | 2026-10-25 | 2026-10-25 |
| T-006 | 0 | Command layer and undo | Serializable, ID-addressed commands producing Immer forward and inverse patches (A1, A3, A12). | T-002 | todo | 2026-10-25 | 2026-10-25 |
| T-007 | 0 | 500-element file generator | Generates test files for the performance budgets (spec 7.1). | T-002 | todo | 2026-10-25 | 2026-10-25 |
| T-008 | 0 | Spike: text wrapping parity | Prototype SVG text with own line-breaking (canvas measurement, `Intl.Segmenter`) next to an editing overlay. Check that wrapping matches in Chrome, Firefox and Safari, and that PNG export matches. Outcome decides A8. | T-001 | todo | 2026-10-25 | 2026-10-25 |
| T-009 | 0 | Spike: drag performance | Render a generated 500-element file as SVG with edges and drag a selection. Measure frame time against the 60fps budget. Outcome decides A2. | T-001, T-007 | todo | 2026-10-25 | 2026-10-25 |
| T-017 | 0 | Spike: KDL parser | Pick a KDL v2 parser for TypeScript. Check that it reports line and column on errors, keeps whole-line comments, and that unknown nodes and properties survive a read and write. Outcome decides F1's tooling; if none fits, write a reader. | T-001 | todo | 2026-10-26 | 2026-10-26 |
| T-018 | 0 | Spike: connector routing | Prototype straight and elbow routing with bend points, attach-anywhere anchors and re-attaching by dragging an end, on a generated 500-element file. Measure frame time while a connected shape is dragged. Outcome decides whether routing is hand-rolled or library-based. | T-001, T-007 | todo | 2026-10-26 | 2026-10-26 |
| T-022 | 0 | Shape standard | Manifest schema, SVG rules and validator for shape packs (spec 3), a contact-sheet script (default size, stretched wide and narrow, light and dark), and three reference shapes. Gates the category tickets. | T-001 | todo | 2026-10-26 | 2026-10-26 |
| T-010 | 1 | Storage adapter interface | One interface for list, read, atomic write and watch within a workspace folder, plus an in-memory implementation for tests (A1). | T-002 | todo | 2026-10-25 | 2026-10-25 |
| T-012 | 1 | SVG renderer: basic elements | Draw rectangles, ellipses and text boxes from the model. The renderer holds no state. | T-002, T-009 | todo | 2026-10-25 | 2026-10-25 |
| T-013 | 1 | Pan and zoom | Infinite canvas with trackpad and mouse pan, pinch and keyboard zoom, zoom to fit. | T-012 | todo | 2026-10-25 | 2026-10-25 |
| T-014 | 1 | Selection | Click, multi-select, drag-box, select all. Selection is restored by undo. | T-012, T-006 | todo | 2026-10-25 | 2026-10-25 |
| T-015 | 1 | Move and resize | Drag and resize with handles, arrow-key nudge. A drag commits as one command. | T-014 | todo | 2026-10-25 | 2026-10-25 |
| T-016 | 1 | Open, save and invalid files | Open a folder and file, explicit save with unsaved indicator. Files that fail to parse are refused with line and column. | T-003, T-004, T-012, T-021 | todo | 2026-10-25 | 2026-10-26 |
| T-019 | 1 | Go server: files | Single binary that serves the embedded app and opens the browser. API for list, read and atomic write, confined to the opened folder with `os.Root` (A4, A7). | T-001 | todo | 2026-10-26 | 2026-10-26 |
| T-020 | 1 | Server security | Bind to 127.0.0.1; session token in the URL fragment, sent as a header; Host and Origin checks; strict CSP; no-referrer (A6). | T-019 | todo | 2026-10-26 | 2026-10-26 |
| T-021 | 1 | HTTP storage adapter | Storage adapter over the server API, inside the opened folder (A1). | T-010, T-020 | todo | 2026-10-26 | 2026-10-26 |
