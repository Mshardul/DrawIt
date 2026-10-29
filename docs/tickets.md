# DrawIt — Tickets

One table, dependency-ordered phases, no dates promised (decision Q3, Q4). A ticket is done when all its tests pass (spec 7.3).

## Format

The table has one fixed set of columns and plain-text cells. Changing a column is a decision: update Q4 as well.

- **Columns:** ID, Phase, Title, Description, Depends on, Story Points, Status, Created on, Updated on.
- **ID:** `T-NNN`, never reused.
- **Depends on:** comma-separated IDs, or `none`.
- **Story Points:** one of `1`, `2`, `3`, `5` or `8`.
- **Status:** `todo`, `doing`, `done` or `blocked`.
- **Created on / Updated on:** `YYYY-MM-DD` and nothing else. Created on never changes; Updated on is the day any field last changed.
- **Cells:** plain text. No emoji, arrows or other symbols.

Phases 0, 1 and 2 are broken into tickets. Later phases are outlined and get tickets as they come up.

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

| ID | Phase | Title | Description | Depends on | Story Points | Status | Created on | Updated on |
|---|---|---|---|---|---|---|---|---|
| T-001 | 0 | Project scaffold | TypeScript app and Go module, test runners, lint, CI. Playwright runs in Chromium, Firefox and WebKit. | none | 3 | done | 2026-10-25 | 2026-10-26 |
| T-002 | 0 | Document model types | Structure, style and layout types per spec 4.3–4.5, with no UI imports. | T-001 | 2 | done | 2026-10-25 | 2026-10-26 |
| T-003 | 0 | KDL v2 reader | Parse a `.drawit.kdl` file into the model. Invalid files fail with line and column (E2). | T-002, T-017 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-004 | 0 | Canonical writer (formatter) | Write the model to canonical KDL: fixed section and property order, stable bytes (spec 4.6). | T-002 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-005 | 0 | Golden-file round-trip tests | Open then save reproduces canonical files byte for byte. | T-003, T-004 | 2 | done | 2026-10-25 | 2026-10-26 |
| T-006 | 0 | Command layer and undo | Serializable, ID-addressed commands producing Immer forward and inverse patches (A1, A3, A12). | T-002 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-007 | 0 | 500-element file generator | Generates test files for the performance budgets (spec 7.1). | T-002 | 2 | done | 2026-10-25 | 2026-10-26 |
| T-008 | 0 | Spike: text wrapping parity | Prototype SVG text with own line-breaking (canvas measurement, `Intl.Segmenter`) next to an editing overlay. Check that wrapping matches in Chrome, Firefox and Safari, and that PNG export matches. Outcome decides A8. | T-001 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-009 | 0 | Spike: drag performance | Render a generated 500-element file as SVG with edges and drag a selection. Measure frame time against the 60fps budget. Outcome decides A2. | T-001, T-007 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-017 | 0 | Spike: KDL parser | Pick a KDL v2 parser for TypeScript. Check that it reports line and column on errors, keeps whole-line comments, and that unknown nodes and properties survive a read and write. Outcome decides F1's tooling; if none fits, write a reader. | T-001 | 3 | done | 2026-10-26 | 2026-10-26 |
| T-018 | 0 | Spike: connector routing | Prototype straight and elbow routing with bend points, attach-anywhere anchors and re-attaching by dragging an end, on a generated 500-element file. Measure frame time while a connected shape is dragged. Outcome decides whether routing is hand-rolled or library-based. | T-001, T-007 | 8 | done | 2026-10-26 | 2026-10-26 |
| T-022 | 0 | Shape standard | Manifest schema, SVG rules and validator for shape packs (spec 3), a contact-sheet script (default size, stretched wide and narrow, light and dark), and three reference shapes. Gates the category tickets. | T-001 | 5 | done | 2026-10-26 | 2026-10-26 |
| T-010 | 1 | Storage adapter interface | One interface for list, read, atomic write and watch within a workspace folder, plus an in-memory implementation for tests (A1). | T-002 | 3 | done | 2026-10-25 | 2026-10-26 |
| T-012 | 1 | SVG renderer: basic elements | Draw rectangles, ellipses and text boxes from the model. The renderer holds no state. | T-002, T-009 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-013 | 1 | Pan and zoom | Infinite canvas with trackpad and mouse pan, pinch and keyboard zoom, zoom to fit. | T-012 | 3 | done | 2026-10-25 | 2026-10-26 |
| T-014 | 1 | Selection | Click, multi-select, drag-box, select all. Selection is restored by undo. | T-012, T-006 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-015 | 1 | Move and resize | Drag and resize with handles, arrow-key nudge. A drag commits as one command. | T-014 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-016 | 1 | Open, save and invalid files | Open a folder and file, explicit save with unsaved indicator. Files that fail to parse are refused with line and column. | T-003, T-004, T-012, T-021 | 5 | done | 2026-10-25 | 2026-10-26 |
| T-019 | 1 | Go server: files | Single binary that serves the embedded app and opens the browser. API for list, read and atomic write, confined to the opened folder with `os.Root` (A4, A7). | T-001 | 5 | done | 2026-10-26 | 2026-10-26 |
| T-020 | 1 | Server security | Bind to 127.0.0.1; session token in the URL fragment, sent as a header; Host and Origin checks; strict CSP; no-referrer (A6). | T-019 | 3 | done | 2026-10-26 | 2026-10-26 |
| T-021 | 1 | HTTP storage adapter | Storage adapter over the server API, inside the opened folder (A1). | T-010, T-020 | 2 | done | 2026-10-26 | 2026-10-26 |
| T-023 | 1 | Grid and snap | Grid display on and off, snap to the grid on and off, snap while moving and resizing, with toggles in the status bar (spec 2.2, 5.1, 5.2). | T-015 | 3 | done | 2026-10-26 | 2026-10-26 |
| T-024 | 2 | Bundled fonts | Inter, Source Serif 4 and JetBrains Mono, each with regular, bold and italic, served with the app and loaded before any text is measured. The font file format is one that can be embedded in SVG export later. | T-001 | 3 | done | 2026-10-27 | 2026-10-27 |
| T-025 | 2 | Text measurement and line breaking | Canvas measurement and the space-only line breaker as app code: wrapped lines from text, width and text style. Output is identical in Chromium and WebKit, and SVG text and the canvas both use geometricPrecision (spec 5.4). Text that has not changed is not measured again. | T-008, T-024 | 3 | done | 2026-10-27 | 2026-10-27 |
| T-026 | 2 | Render labels and text boxes | Node labels centred in the shape's label rectangle from the pack manifest, or in the element box for rectangle and ellipse, which have no manifest; labels wrap at that width. A text box with no w fits its content; a text box with w wraps at that width and its height follows the wrapped lines. Drawn as SVG text, one style per element, default text style until styling arrives. | T-025, T-012, T-022 | 5 | done | 2026-10-27 | 2026-10-27 |
| T-027 | 2 | Text editing overlay | Double-click a node or text box to edit in place; double-click empty canvas to create a text box. The overlay measures and wraps exactly like the display. Typing is grouped by pauses and each group is one undoable command. | T-026, T-006 | 8 | done | 2026-10-27 | 2026-10-29 |
| T-028 | 2 | Connector routing | Straight and elbow routing as app code for rectangles, ellipses and text box bounds: auto, side and side-with-position anchors, outline clipping, kept bend points, endpoints always recomputed. Other shapes route to their bounding box. Pure functions, tested without a browser. | T-018 | 5 | done | 2026-10-27 | 2026-10-29 |
| T-029 | 2 | Render edges | Edges drawn from the model as paths. The path follows the route property and each end follows head-start and head-end (arrow, dot or none), with the defaults from the style section when style is absent; free ends come from layout. The defaults are straight, none and arrow (spec 4.4). Moving or resizing an element re-routes only its edges. | T-028, T-012 | 5 | done | 2026-10-27 | 2026-10-29 |
| T-030 | 2 | Draw edges | Line and arrow tool: drag from an element, or from empty canvas, to an element or a free point. Creates the edge as one undoable command. The edge gets an explicit ID when another edge joins the same pair or either end is free, because the default ID, built from the two ends, cannot name a free end (spec 4.3). | T-029, T-014 | 5 | done | 2026-10-27 | 2026-10-29 |
| T-031 | 2 | Edge selection | Click an edge to select it, with a hit test on the routed path, and show end handles. Selection works with multi-select, drag-box and select all. | T-029, T-014 | 3 | done | 2026-10-27 | 2026-10-29 |
| T-032 | 2 | Re-attach edge ends | Drag an end handle onto another element to re-attach it, or onto empty canvas to detach it to a free point. A drop on an element writes the side and position along it (for example left:0.3), never auto; a drop on empty canvas writes the free point. A drag commits as one command. | T-031, T-015 | 5 | todo | 2026-10-27 | 2026-10-27 |
| T-033 | 2 | Bend points | Double-click the path of a selected edge to add a bend point, drag a point to move it, double-click a point to remove it. Each edit is one undoable command that writes the via list. Bend points are kept when the ends move. | T-031 | 3 | todo | 2026-10-27 | 2026-10-27 |
| T-034 | 2 | Edge labels | Edge labels drawn at their position along the path and moving with it, dragged along the path, edited with the text overlay. | T-029, T-026, T-027 | 5 | todo | 2026-10-27 | 2026-10-27 |
| T-035 | 2 | Phase 2 performance check | In Chromium and WebKit, on a generated 500-element file with labels and routed edges: dragging a selection and resizing a shape with attached edges stay inside the 60fps budget (spec 7.1). Resize re-routes only the attached edges and measures a label again only when its width changed. | T-034 | 3 | todo | 2026-10-27 | 2026-10-27 |
