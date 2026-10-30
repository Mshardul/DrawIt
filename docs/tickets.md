# DrawIt — Tickets

One table, dependency-ordered phases, no dates promised (decision Q3, Q4). A ticket is done when all its tests pass (spec 7.3).

## Format

The table has one fixed set of columns and plain-text cells. Changing a column is a decision: update Q4 as well.

- **Columns:** ID, Phase, Title, Description, Depends on, Story Points, Status, Created on, Updated on.
- **ID:** `T-NNN`, never reused.
- **Phase:** `0` to `7`.
- **Depends on:** comma-separated IDs, or `none`.
- **Story Points:** one of `1`, `2`, `3`, `5` or `8`.
- **Status:** `todo`, `doing`, `done` or `blocked`.
- **Created on / Updated on:** `YYYY-MM-DD` and nothing else. Created on never changes; Updated on is the day any field last changed.
- **Cells:** plain text. No emoji, arrows or other symbols.

Phases 0 to 4 are broken into tickets. Later phases are outlined and get tickets as they come up.

## Phases

| Phase | Goal |
|---|---|
| 0 | Foundation: document model, KDL round-trip, formatter, commands, test harness. Four risk spikes: KDL parser, text wrapping, drag performance, connectors. |
| 1 | Minimal editor: local Go server (file access, security), SVG renderer, select, move, resize, save. |
| 2 | Connectors and text. |
| 3 | Styling: theme, classes and overrides resolved from the style section, drawn on shapes, edges and text, and edited from a style panel with a colour picker. |
| 4 | Shape packs: pack loader, pack shapes drawn, hit-tested and routed by their outlines, shape library sidebar and creation tool, and one ticket per shape category, built in parallel from the shape standard (T-022). Category work can start before the renderer exists. |
| 5 | Editing commands: delete, duplicate, bring to front and send to back, align and distribute, lock, frames, images. |
| 6 | Workspace, files, file watching, preferences, clipboard, export. |
| 7 | Polish: performance budgets, in-app documentation, release. |

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
| T-032 | 2 | Re-attach edge ends | Drag an end handle onto another element to re-attach it, or onto empty canvas to detach it to a free point. A drop on an element writes the side and position along it (for example left:0.3), never auto; a drop on empty canvas writes the free point. A drag commits as one command. | T-031, T-015 | 5 | done | 2026-10-27 | 2026-10-29 |
| T-033 | 2 | Bend points | Alt-click the path of a selected edge to add a bend point, drag a point to move it, Alt-click a point to remove it. Each edit is one undoable command that writes the via list. Bend points are kept when the ends move. | T-031 | 3 | done | 2026-10-27 | 2026-10-29 |
| T-034 | 2 | Edge labels | Edge labels drawn at their position along the path and moving with it, dragged along the path, edited with the text overlay. | T-029, T-026, T-027 | 5 | done | 2026-10-27 | 2026-10-29 |
| T-035 | 2 | Phase 2 performance check | In Chromium and WebKit, on a generated 500-element file with labels and routed edges: dragging a selection and resizing a shape with attached edges stay inside the 60fps budget (spec 7.1). Resize re-routes only the attached edges and measures a label again only when its width changed. | T-034 | 3 | done | 2026-10-27 | 2026-10-29 |
| T-036 | 3 | Style resolution | Resolve the style section to one style per element: properties merge in the order built-in defaults, the element's class, its override; then tokens are replaced from the theme, a well-known token the file lacks from the built-in theme. A token nothing defines leaves the property unset. Pure functions over the model. | T-002 | 5 | done | 2026-10-29 | 2026-10-29 |
| T-037 | 3 | Default theme and token vocabulary | The built-in default theme with the well-known tokens and values, and the default look per element kind, both as laid out in spec 4.4, and the fallback for well-known tokens a file's theme lacks. | T-036, T-024 | 3 | done | 2026-10-29 | 2026-10-29 |
| T-038 | 3 | Style value parsing | Parse and print dash, gradient (with optional stop positions) and shadow values in the canonical form of spec 4.4. A value that does not parse is kept as written and skipped when drawing. | T-002 | 3 | done | 2026-10-29 | 2026-10-29 |
| T-039 | 3 | Property registry | Typed registry of the style properties in spec 4.4 with group, value type and accepted values. The style panel and the validator read it. | T-036 | 3 | done | 2026-10-29 | 2026-10-29 |
| T-040 | 3 | Render fill, stroke and opacity | Draw fill, stroke, stroke width, radius and opacity from the resolved style on shapes, text boxes and edges, with the colours of the default theme. The renderer holds no state. | T-037, T-012, T-029 | 5 | done | 2026-10-29 | 2026-10-29 |
| T-041 | 3 | Style commands | Set or clear one property on the selection as one undoable command. Each writes `el` override lines; clearing a property removes it from its line, and a line with no property left is dropped, so the element returns to its class and the theme. | T-036, T-006, T-014 | 3 | done | 2026-10-29 | 2026-10-29 |
| T-042 | 3 | Style panel: fill and stroke | Panel for the selection, built from the property registry, with fill, stroke, stroke width, radius and opacity. Radius is shown for the built-in rectangle and for text boxes only. Mixed values are shown as mixed. Edits go through the style commands. | T-039, T-040, T-041 | 5 | done | 2026-10-29 | 2026-10-30 |
| T-043 | 3 | Colour picker | Colour picker for fill, stroke and text colour. It offers the well-known theme tokens first and raw colours second. Recent colours are kept for the session only. | T-042 | 5 | done | 2026-10-29 | 2026-10-30 |
| T-044 | 3 | Render text styles | Apply font, size, weight, italic, underline, colour, alignment and line height from the resolved style to labels, text boxes and edge labels. Measuring, wrapping and the editing overlay use the same style, so they match the display. | T-037, T-026, T-027, T-034 | 5 | done | 2026-10-29 | 2026-10-30 |
| T-045 | 3 | Panel: text fields | Text properties in the style panel for nodes, text boxes and edges: font and alignment as lists, size, weight and line height as numbers, italic and underline as checkboxes, and text colour with the colour picker. A pack shape has no text fields. | T-042, T-044 | 3 | done | 2026-10-29 | 2026-10-30 |
| T-046 | 3 | Render dash, gradient and shadow | Draw dash, gradient fill and shadow from the resolved style. Gradient and shadow definitions are part of the rendered tree, built once and not recomputed per pointer move, so SVG export can reuse them. While a drag would break the frame budget, it is drawn without filters and the committed render keeps them. | T-038, T-040 | 5 | done | 2026-10-29 | 2026-10-30 |
| T-047 | 3 | Panel: dash, gradient and shadow fields | Dash, gradient and shadow properties in the style panel. | T-042, T-046 | 3 | done | 2026-10-29 | 2026-10-30 |
| T-048 | 3 | Phase 3 performance check | In Chromium and WebKit, on a generated 500-element file with shadows, gradients and styled text: dragging a selection and resizing a shape stay inside the 60fps budget (spec 7.1). | T-044, T-046 | 3 | done | 2026-10-29 | 2026-10-30 |
| T-049 | 4 | Pack loader | Load the bundled packs through a source of pack files, check them with the shape validator, resolve `<pack>.<id>` names (`core` shapes need no prefix) and apply the stretch for an element size, cached by shape and size. Report shape names no pack provides. Pure code, no renderer. | T-022 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-050 | 4 | Render pack shapes and placeholders | Draw nodes and shapes from their pack SVG at the element size, coloured by role from the resolved style. An unknown shape is a dashed placeholder showing its name, at its layout size, or the standard default size when the layout has none. Labels use the manifest label rectangle. | T-049, T-040, T-026 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-051 | 4 | Pack outlines for hit-testing and straight routing | Flatten the outline once per shape and size. Shape hit-testing is inside the outline plus a margin, and straight edges clip to the outline. Moving or resizing a shape re-routes only its edges. | T-049, T-028, T-031 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-052 | 4 | Shape library sidebar | Left sidebar listing shapes by category with search over names and tags, and lazily rendered previews. Rectangle and ellipse are listed as built-in entries. | T-049, T-050 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-053 | 4 | Shape creation tool | Clicking a shape in the sidebar arms the tool: a click places the node at its default size and a drag sizes it, as one undoable command. The node gets an unused ID built from the shape's ID without its pack prefix, such as `load-balancer`. | T-052, T-006 | 3 | todo | 2026-10-29 | 2026-10-29 |
| T-054 | 4 | Shapes: basic | In the `core` pack: rounded-rect, circle, diamond, triangle, pentagon, hexagon, octagon, star, callout, callout-round, bracket and brace. Each has a name and tags, to the shape standard. | T-022, T-063 | 8 | todo | 2026-10-29 | 2026-10-29 |
| T-055 | 4 | Shapes: flowchart | In the `core` pack: process, decision, terminator, data, document, manual-input and connector. Each has a name and tags, to the shape standard. | T-022, T-063 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-056 | 4 | Shapes: arrows and lines | In the `core` pack: arrow-right, arrow-left, arrow-up, arrow-down, arrow-double, arrow-curved, arrow-u-turn and divider. Each has a name and tags, to the shape standard. | T-022, T-063 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-057 | 4 | Shapes: architecture | In the `arch` pack: server, database, cache, queue, cdn, load-balancer, gateway, dns, firewall, storage-bucket, function, container, client, browser, mobile, user and cloud. Icon shapes share one canvas size and level of detail. | T-022, T-063 | 8 | todo | 2026-10-29 | 2026-10-29 |
| T-058 | 4 | Shapes: network | In the `net` pack: router, switch, vpn, internet, subnet and on-prem. Each has a name and tags, to the shape standard. | T-022, T-063 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-059 | 4 | Shapes: C4 | In the `c4` pack: person, software-system, container, component and boundary. The boundary stretches with fixed corners. | T-022, T-063 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-060 | 4 | Shapes: infographic | In the `info` pack: banner, badge, numbered-step, timeline-marker and ribbon. Each has a name and tags, to the shape standard. | T-022, T-063 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-061 | 4 | Phase 4 performance check | In Chromium and WebKit, on a generated 500-element file of pack shapes with routed edges: dragging a selection and resizing a shape with attached edges stay inside the 60fps budget (spec 7.1). | T-050, T-062 | 3 | todo | 2026-10-29 | 2026-10-29 |
| T-062 | 4 | Pack attachment and elbow exits | A side and position attach where a line inward from the bounding box first meets the pack outline, with the bounding-box point as fallback (spec 5.3). Auto anchors use the manifest anchors, a re-attach drop writes the side and position, and an elbow route leaves the attachment point along the direction of its bounding-box side. | T-051, T-032 | 5 | todo | 2026-10-29 | 2026-10-29 |
| T-063 | 4 | Contact sheet role rules | The contact sheet draws each part by the app's role rules: `detail` in the stroke colour at two thirds of the stroke width, `fill` and `stroke` from the element's fill and stroke. Category reviews then show what the app draws. | T-022 | 2 | todo | 2026-10-29 | 2026-10-29 |
