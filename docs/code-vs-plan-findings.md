# Findings: current code and tickets against the plan

Working record of seven read-only subagent reports, 2026-11-05, copied as the agents wrote them. Each report is under a heading naming its source. The first reports of the front-end, server and model agents were written before those agents had read `decisions.md` and the spec in full; the corrected reports follow them. Nothing below has been edited.


---

# Front-end shell inventory: First report

Inventory of web/ front-end shell (read-only). Paths relative to /Users/shardul/Documents/Github/DrawIt/web. Q15-Q20 and spec sections were not read; I read only decisions E43-E83 and A27-A33.

**1. DOM the shell builds** (`src/app/shell.ts`, `startShell`; `index.html` is only `<div id="app">` plus `/src/main.ts`)
- Everything is built with the local `el()` helper (shell.ts:38) and attached by one `root.replaceChildren` (shell.ts:153-158):
  - `header.bar` (shell.ts:154):
    - `h1` "DrawIt"
    - `select[aria-label=File]` (`picker`, shell.ts:97), filled from the folder listing
    - `span.name` (`current.path`)
    - `span.unsaved` "Unsaved changes", hidden unless dirty
    - `button` "Save", disabled when no file is open
    - `div.tools[role=toolbar][aria-label=Tools]` holding `button` "Select" (title "Select (V)"), "Arrow" (title "Line and arrow (L)") and "Frame" (title "Frame (F)"), in that order. They carry `aria-pressed`.
  - `div.error[role=alert]` banner, hidden by default.
  - `div.workspace`, a flex row of `aside.library`, `svg.canvas` and `aside.style-panel`.
  - `footer.status` (shell.ts:113) with `span.zoom` ("NN%"), label+checkbox "Grid", label+checkbox "Snap", and label "Grid size" with a select of 4/8/16/32/64.
- Canvas SVG layers (shell.ts:137-151): `defs` and `g.world`, which holds `g.grid`, `g.elements` and `g.overlay`.
- Created elsewhere:
  - `.text-edit` textarea, appended to `root` (`src/text/edit.ts`).
  - Library sidebar `aside.library[aria-label=Shapes]` (`src/library/sidebar.ts:30`).
  - Style panel `aside.style-panel[aria-label=Style]` (`src/style/panel.ts:~56`). Its first child is `div.arrange-group` (`src/style/arrange-group.ts:43`): buttons Align left/centre/right/top/middle/bottom, Distribute horizontally/vertically, Bring to front, Send to back. It also has a "Locked" checkbox row, then one row per style property with a Clear button and colour pickers (labels "Pick fill", "Pick stroke", "Clear fill", and so on).
- There are no Home, undo, redo, Export, hand, rectangle, ellipse, text or image buttons. There are no panels toggles, no dialogs, no palette and no floating elements except `.text-edit`.

**2. Tool state and shortcuts**
- `type Tool = "select" | "edge" | "shape" | "frame"` (`src/connectors/input.ts:10`). The active tool is a closure `let tool` in `startShell` (shell.ts:163) and is switched with `setTool` (shell.ts:210).
  - `setTool` sets `aria-pressed` on the three buttons, toggles the `.drawing` crosshair class when the tool is not select, clears `armed` and the library highlight unless the tool is "shape", and clears drafts.
- The "shape" tool is armed only from a library click (`onPick`, shell.ts:125; clicking the armed entry again returns to select). There is no rectangle, ellipse, text, image or hand tool.
- Every tool reaches the input modules through `getTool()`/`setTool()` callbacks. After a placement or an edge draw the tool returns to select.
- Key bindings, all as separate `window` keydown listeners, each skipping text-entry targets:
  - `v`: select. `l`: edge/arrow (`connectors/input.ts:87-88`). `f`: frame (`attachPlaceInput` `key:"f"`, shell.ts:416; handled `library/input.ts:96`).
  - `Escape`: cancel a gesture, or return from edge/shape/frame to select (`connectors/input.ts:81`, `library/input.ts:93`). It also cancels in `move/input.ts:123`, `bend-input.ts:119`, `reattach-input.ts:87` and `label-input.ts:84`. In `select/input.ts:89` it clears the selection. In `text/edit.ts:183` it ends text editing, and in `style/panel.ts:227` it closes the colour pickers.
  - `g`: toggle grid. `Shift+g`: toggle snap (shell.ts:446-453). `Cmd/Ctrl+s`: save (shell.ts:454).
  - `Cmd/Ctrl+z` and `Cmd/Ctrl+Shift+z`: undo and redo (shell.ts:460-465). `text/edit.ts:186` also handles `Cmd+z` inside the text editor.
  - `Cmd/Ctrl+a`: select all (`select/input.ts:86`). `Cmd/Ctrl+d`: duplicate. `Cmd/Ctrl+Shift+a`: select inside (children of a frame). `Cmd/Ctrl+Shift+l`: lock toggle (`edit/input.ts:23,32,40`). `Delete` and `Backspace`: delete (`edit/input.ts:48`).
  - Arrow keys and `Shift+Arrow`: nudge (`move/input.ts:129`, `nudgeCommand`). `Cmd/Ctrl+Enter`, or `Enter` in a name field: commit text edit (`text/edit.ts:183`).
  - Zoom keys, `Space` and `Shift+1` are listed in item 3.
  - Pointer and clipboard events: double-click starts text edit (`text/edit.ts:230`). Image drop and paste are in `images/input.ts:80-81`; they add an image, not a DrawIt clipboard document. Alt-click on a selected edge adds a bend. Alt while placing bypasses snap.
- No shortcut registry exists; the bindings are scattered. No bindings for Cmd+C/X/V DrawIt clipboard, `r`, `o`, `t`, `h` or `i`.

**3. Pan and zoom** (`src/view/input.ts`, `view.ts`; attached in shell.ts:429)
- Plain wheel pans (`wheelView`, input.ts:21). `Ctrl`+wheel and trackpad pinch zoom about the cursor.
- Space-held left-drag pans, and so does middle-button drag (input.ts:107-114). The canvas gets class `panning` (grabbing cursor). There is no hand tool.
- Zoom keys: `Cmd/Ctrl` with `=`, `+`, `-` and `0` (zoom step 1.25, `0` resets to 100%), and `Shift+1` fits everything with a margin of 48 (`keyView`, input.ts:36-43).
- Zoom display is `span.zoom` in the status footer. It is read-only: there are no zoom buttons and no zoom field.
- The shell exposes `view`, `setView` and `fit()`. `fit()` runs after every open. The view is never saved.

**4. Grid and snap**
- Checkboxes "Grid" and "Snap" and a "Grid size" select sit in `footer.status` (shell.ts:110-120), with state `grid: GridSettings {show:false, snap:false, size:8}` (shell.ts:170) and `setGrid` (shell.ts:226).
- Keys `g` and `Shift+g` also toggle. The checkbox `blur()`s after change so keys keep working.
- Snap size is passed to the place and transform inputs through `getGrid: () => grid.snap ? grid.size : 0`. The grid is drawn by `describeGrid` into `g.grid`.
- It is not persisted; it resets on reload.

**5. Open, save and file flow**
- `src/main.ts`: `startSession` reads the token from the URL fragment (`#token`), stores it in `sessionStorage` key `drawit.token`, and strips the fragment (`src/storage/session.ts`). With no token the page shows the text "DrawIt: open the link the drawit server prints in the terminal." Otherwise it runs `startShell(app, new HttpStorage({token}))`. If that throws, the page shows "DrawIt could not read the folder: ...".
- At startup `workspaceFiles(storage)` (`src/app/workspace.ts:14`) lists the one served folder and keeps names ending `.drawit.kdl`. The picker is filled from that list and `shell.open(paths[0])` opens the first file (shell.ts:470-474). There is no start screen, folder browser, recent files, thumbnails or project concept. With an empty folder it shows the error banner "No .drawit.kdl files in this folder." The list is read once and never refreshed.
- Switching the picker opens another file (`doOpen`, shell.ts:248). If the current file is dirty it asks `confirm("Discard unsaved changes to ...?")` (OK/Cancel). There is no Save/Discard/Cancel dialog.
- Save: an explicit "Save" button or `Cmd/Ctrl+S` calls `shell.save()`, which calls `OpenFile.save` (`workspace.ts:41`) and writes the canonical text via `writeText`. There is no autosave and no preference for it. A failed save shows the error banner "<path> was not saved: ...".
- The unsaved indicator is the `span.unsaved` text "Unsaved changes". `OpenFile.dirty` compares `writeDiagram(document)` with `savedText` (`workspace.ts:36`), so undoing back to the saved state clears it. `beforeunload` calls `preventDefault` when dirty (shell.ts:466).
- Invalid files: `openFile` returns `{ok:false}` on `KdlSyntaxError` (`workspace.ts:65-75`). The shell shows "<path> was not opened: <message>" (including line and column), keeps the previous file open, and resets the picker. Other storage errors are shown the same way.
- There is no notion of closing a file or returning to a start screen. `Shell.file` is never reset to null after the first open. There is no file watching.
- Image base path: `images.setBase(path)` on open.
- Images use `ImageStore` (`src/images/`), `assets/` paths, and `attachImageInput` with `storage`.

**6. Undo and redo**
- Keys only: `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` (shell.ts:460-465), skipped when `isTextEntry(target)` (`src/app/text-entry.ts`). The calls are `current.history.undo()/redo()` then `refresh()`. There are no buttons. `Ctrl+Y` is not bound.
- History is in `src/commands/history.ts` and is per `OpenFile`.

**7. Library and style/arrange panels**
- Library (`src/library/sidebar.ts`): `aside.library` has a search input ("Search shapes"), then sections with an `h2` per category and a 2-column grid of `button.library-item`. Each item is a drawn SVG preview (72x52, lazily mounted through `IntersectionObserver`) plus the shape name text (`item.append(preview, entry.name)`, line 65); `title = entry.name` too. When there are no matches it shows "No shapes match." A click arms the shape tool. No hide/show.
- Library width is fixed at 224px (`app.css:43`, `box-sizing: border-box`). The style panel is fixed at 200px (`app.css:10`). Neither is resizable or hideable, and no code does either.
- Style panel: arrange group, then the Locked row, then one row per property with a Clear button. Colour properties get a "Pick …" button that opens a picker of theme tokens plus recent colours (`RecentColours`, `style/colours.ts:25`, kept in memory, limit 8, never persisted).

**8. Persisted UI state**
- Only the session token in `sessionStorage` (`drawit.token`). No `localStorage`, no preferences file or API, no layout, grid, shortcut or panel-width storage. Recent colours are in memory only.

**9. Tests that depend on the shell UI**
- Unit tests (vitest): `src/app/workspace.test.ts` (open and save logic, no DOM), `src/view/input.test.ts`, `src/view/view.test.ts` (pure view maths), `src/storage/*.test.ts`. None builds the shell DOM. `src/style/panel-model.test.ts`, `colours.test.ts` and `library/*.test.ts` are model-level only.
- E2E: 29 of 38 specs call `startShell` through a `boot()` helper that imports `/src/app/shell.ts` and `/src/storage/memory.ts`. Their dependencies:
  - Toolbar buttons: `getByRole("button",{name:"Select"|"Arrow"|"Frame",exact})` in `draw-edge.spec.ts` and `frames.spec.ts` (3 uses).
  - Keys `f`, `l`, `v` (and `g`, `Shift+G`) in `frames`, `draw-edge`, `grid-snap`, `delete`, `edges` and others.
  - Top bar: `getByLabel("File")` in `open-save.spec.ts` (selectOption, option text), and `.bar select` in `pan-zoom.spec.ts:57`. `getByText("Unsaved changes")` in `open-save`, `move-resize` (6), `select` and `pan-zoom`. The Save button is not located by selector; tests use `ControlOrMeta+s`. `getByRole("alert")` in `open-save` (refused file, "No .drawit.kdl files", line/column text).
  - Status bar: `getByLabel("Grid",{exact})`, `getByLabel("Snap",{exact})`, `getByLabel("Grid size")` and `.status .zoom` in `grid-snap.spec.ts`. `fonts.spec.ts` matches only a font status property, not the footer.
  - Panels: `getByRole("complementary",{name:"Shapes"})`, `.library-item` buttons by name, `searchbox "Search shapes"`, "No shapes match." and heading "Basic" in `library.spec.ts`. In `arrange.spec.ts`, `getByRole("button",{name,exact})` for the arrange names. In `style-panel.spec.ts` and `lock.spec.ts`: "Pick fill", "Pick stroke", "Clear fill", "Clear shadow", "Custom fill", "Locked" and `getByLabel(name)`.
  - Canvas internals: `.canvas`, `.world`, `.elements > g`, `.selection`, `.marquee`, `.handle`, `.text-edit`, `.canvas pattern`.
  - Keys used in e2e: `ControlOrMeta+z` (14 uses), `ControlOrMeta+Shift+z`, `ControlOrMeta+s`, `ControlOrMeta+=`/`-`/`0`, `Shift+1`, Space down/up, Escape (26 uses), Delete/Backspace and ArrowRight.
- If the top bar and tool buttons are replaced, these break: `open-save`, `pan-zoom` (`.bar select`), `grid-snap`, `draw-edge`, `frames`, `move-resize` and `select` (unsaved text), plus every spec whose `boot()` expects `startShell` to open the first file itself. `playwright.config.ts` runs chromium, firefox and webkit.

**10. Decisions versus code (E43-E83, A27-A33)**
- E43 one file open, close returns to landing: the one-file part is present (single `current`); closing and the landing page are absent.
- E44-E47, E56-E60, E70, E74 landing page, start screen, folder browser, thumbnails: absent. The code lists one flat folder into a `<select>` and auto-opens the first file, the opposite of E70.
- E48-E50 Export (SVG/PNG): absent. No export button or code in the shell.
- E51 autosave: absent (explicit Save and `Cmd+S` only).
- E52-E55 library folder, new/rename/delete/import: absent.
- E61 floating toolbar: conflicts. Tools are three fixed buttons inside `header.bar`, and there is no hand, rectangle, ellipse, text or image tool.
- E62 tiles without names: conflicts. The library tiles carry the visible name under the drawn preview (`sidebar.ts:65`), although `title` already gives the name on hover. Search by name is present.
- E63 panels open by default and hideable: partly. They are always open and cannot be hidden.
- E64 file pill: absent. The current top bar is a full-width header with `h1`, file picker, name, unsaved text and Save. No Home, undo, redo or Export buttons.
- E65-E68 clipboard copy, cut, paste: absent (only image paste and `Cmd+d` duplicate).
- E69 PNG limit: absent.
- E71 actions registry and command palette: absent. Bindings are scattered across `window` listeners, as listed in item 2.
- E72, E73 rebinding, reserved keys: absent. The current defaults avoid `Cmd+N/W/T`.
- E75 Save/Discard/Cancel on leaving: conflicts. The code uses `confirm()` OK/Cancel on file switch; `beforeunload` is present.
- E77 toolbar position and grip: absent.
- E78 hand tool: Space-drag and middle-drag and trackpad pan are present (`view/input.ts`); there is no hand tool.
- E79 hide toolbar: absent (no View or Preferences UI).
- E80-E83 status pill, panel resize, narrow-canvas rules: conflicts. The status is a full-width bottom `footer.status` with the grid size select, panels are fixed at 224px and 200px, and there is no layout logic.
- A27 folder browser and A28 library access: absent in the UI. The storage adapter (`src/storage/adapter.ts`, `http.ts`) only has list, read and write on one served folder (I did not read the Go side).
- A29 single browser session: absent in the UI (the token is held in `sessionStorage`).
- A30 file change watching: absent.
- A31-A33 preferences file: absent. No preferences code, and the only store is the `sessionStorage` token.


---

# Front-end shell inventory: Corrected report, after reading decisions.md and the spec in full

Corrected section 10, built from a full read of the docs. Paths are relative to /Users/shardul/Documents/Github/DrawIt/web. Code references are from my first pass (shell.ts, view/input.ts, sidebar.ts, session.ts, workspace.ts).

**(1) Read in full**
- decisions.md: every row of D1-D12, F1-F28, A1-A33, E1-E83, Q1-Q21, L1-L3, and open questions O1-O5. One catch: my first-pass listing showed E63-E83 and A27-A33 only in part, and Q15 was truncated, so I re-read those rows here.
- Spec: sections 2, 5.1-5.8, 6.1, 6.2 and 7.1-7.3.
- ui-mockups.html: the notes of all 36 states (Home 5, Dialogs 10, Editor 17, plus the Another tab and Changed on disk states). Note the Home screens have their own `bar` with an h1 "DrawIt", Import and Open folder buttons. That is a Home bar, not an editor top bar.
- Not read: spec sections 5.4, 6.3, 3, 4 and 8-9 beyond what was needed; F-rows are format-only.

**(2) Corrected section 10: shell-relevant statements**

Status key: S = satisfied, C = conflicts, A = absent, P = partial.

Editor frame
- **E61 / spec 5.1 toolbar** (C and A): there is no floating toolbar. The tools are three buttons inside `header.bar` (shell.ts:101-107). There is no hand, rectangle, ellipse, text or image tool, and the `Tool` type has four values (`connectors/input.ts:10`). Rectangle and ellipse exist only as library entries (A22: the library lists them, so that part is S).
- **E62** (P): tiles are drawn previews with lazy rendering, which is S (sidebar.ts:41-69). The name is also printed under each tile (sidebar.ts:65), which C. The `title` hover is already there. Search by name and tags: S for names; tags not checked.
- **E63 / E6 / spec 5.1 "Configuration"** (P): both panels are always open, so the open-by-default part is S. They cannot be hidden. There is no View menu or Preferences dialog (A).
- **E64** (C and A): the shell has no file pill, no Home, no undo or redo buttons and no Export. The full-width header (shell.ts:154) holds the picker, name, "Unsaved changes", Save and tools.
- **E77 toolbar position and grip, E79 hide toolbar** (A).
- **E78 hand tool** (P): Space-drag, middle-drag and trackpad pan are S (`view/input.ts:107-114`). The hand tool is A.
- **E80 / E82 status pill** (C and A): the status is a full-width `footer.status` (shell.ts:113) with zoom text, Grid and Snap checkboxes and a Grid size select. There is no cursor position, no pill, no fit logic and no hiding. Zoom has no -/+ buttons.
- **E81 / E83 panel resize** (C): the widths are fixed, library 224 px and style panel 200 px (`app.css:43,10`). That matches the default widths in spec 5.1, but there is no drag edge, no min/max and no 480 px canvas rule.
- **Spec 5.1 right panel** "fill, stroke, text, arrange, position, size": arrange S (`arrange-group.ts`). Fill, stroke and text are present as registry rows (`panel-model.ts`). Position and size fields: not checked, treat as unconfirmed.
- **E31 / E71 / spec 5.1 palette** (P and A): click a library entry to arm the tool, then click or drag to place, which is S (shell.ts:125-133, `library/input.ts`). The palette (Cmd/Ctrl+K), a single action registry and arming from the palette are A. Key handlers are scattered `window` keydown listeners, which is the exact thing E71 rejects.
- **E72 / E73** (A for rebinding). The current defaults avoid `Cmd+N/W/T`, so E73 is S by accident.
- **Spec 7.2 "every action reachable from the keyboard"** (P): undo, redo, save, grid, select tools and zoom keys exist. Fit is `Shift+1`. There is no key for hand, rectangle, ellipse, text or image, and no keyboard route to the picker or library.
- **Spec 2.1 zoom to selection** (A): `keyView` (`view/input.ts:36`) has zoom in, zoom out, reset and fit only. Pinch zoom is S via Ctrl+wheel; O3 (Safari gesture events) is not handled.
- **Spec 2.2 grid / snap** (S, for the controls): checkboxes, `g` and `Shift+g`. E-rows place them in the status pill, and A32 lists them in preferences (A).

Workspace and files
- **E1 / spec 5.6 save** (P): `Cmd/Ctrl+S` is S (shell.ts:454). Autosave about 2 s after the last edit, as a preference, default on in the library and off in an opened folder (E51), is A.
- **E2 / spec 5.6 invalid files** (S): `openFile` refuses with line and column and keeps the previous file (`workspace.ts:65-75`, shell.ts:262).
- **E3 external changes** (A): there is no polling (A30), no hash compare and no reload command.
- **E43 / spec 2.20 close returns to landing** (A): there is no close or Home. `current` is never reset to null.
- **E44-E47, E56-E60 start screen, landing page, cards, thumbnails, folder browser** (A): the app opens `paths[0]` of a flat `<select>` (shell.ts:470-474). E47 "command line, then preferences, then start screen" and E70 "never on a file" both C, since the code auto-opens the first file.
- **E48-E50, E69 / spec 5.8 export** (A): no dialog, no exporter, no PNG or SVG code in `src/`.
- **E52-E55, E74, E76 library, new, rename, delete, import** (A; also A27, A28).
- **E65-E68 / spec 5.7 clipboard** (A): there is no DrawIt copy, cut or paste. Image paste (`images/input.ts:81`) is a separate path. Q5 and Q14 put some of these after v1; see the note below.
- **E75 Save/Discard/Cancel** (C): shell.ts:249 uses `confirm("Discard unsaved changes to …?")`, which is OK/Cancel. `beforeunload` is S (shell.ts:466).
- **Save state text** (C): the mockup and spec call for Saving / Saved / Not saved in the file pill. The code shows only "Unsaved changes" in `span.unsaved`, hidden when clean. `OpenFile.dirty` itself (content comparison with `savedText`) is S.
- **A29 single session** (A). **A30 file change check** (A).
- **A14 / A31-A33 / E35 preferences** (A for the file). The A14 rule rejects `localStorage`, and the code does not use it. S. Only `sessionStorage` holds the token (spec 6.2 and `storage/session.ts` match). E35 recent colours are session-only in the `RecentColours` class (`style/colours.ts:25`): S.
- **A5-A7, A25** storage via the server, the 32 MiB limit and workspace = a folder: S in the adapter (not re-verified on the Go side).

Behaviour that already holds
- **E4 / spec 5.2** multi-select and select-inside (`edit/input.ts:32`): S.
- **E11, E19, E25** double-click edits text (`text/edit.ts:230`): S. **E13** overlay editor with Escape, Cmd/Ctrl+Enter and undo inside the editor (`text/edit.ts:183-186`): S.
- **E14, E39** line tool and shape tool last one use and return to select (`connectors/input.ts:75`, `library/input.ts:86`): S. **E16, E20, E21** also S.
- **E38** click places at default size with grid-snapped corner: S via `place` and `getGrid`.
- **A3 / spec 5.5** history per file: S. **Undo and redo restore selection**: S (`History`). The UI for undo and redo is keys only.
- **A24** drag falls back to plain rendering above `SHADOW_DRAG_LIMIT` (shell.ts:193): S. **A26** images via the adapter with blob URLs: S (`images/store.ts`).
- **A19** unknown-shape placeholder: not checked in the shell; probably in the renderer.
- **Q14 / Q5** stacking buttons "after v1": Bring to front and Send to back are already in the arrange group, so the code is ahead of the tickets.
- **Q2 / Q6** tests: Playwright specs in three browsers plus `@budget` projects, S.
- **Q16** the mockups are the UI reference, so shell work is meant to match them.

**(3) What the full reading changes in sections 1-9**
- Section 1: the Home screens in the mockups carry their own bar (h1 "DrawIt", Import, Open folder). So "no top bar" applies to the editor, not to Home. The current `header.bar` also has an `h1` "DrawIt" and a Save button; neither is in the file pill (E64 lists Home, name, save state, undo, redo and Export only). Save has no button in the new design.
- Section 2: spec 2.1 adds "zoom to selection", which I did not list as missing. Spec 7.2 asks for keyboard reach of every action, so the lack of shortcuts for the new tools matters.
- Section 5: there is no "Saving" state, and no cursor-position display. The "No .drawit.kdl files in this folder." banner has no equivalent screen, since the First run Home state replaces it.
- Section 7: the 224 px and 200 px widths match spec 5.1's defaults. The tile name conflicts with E62 only as visible text; the hover `title` already exists.
- Section 8: confirmed that nothing but the token is stored and that this is deliberate (A14, E35).
- Section 9: no change to the list of tests. Add that `pan-zoom.spec.ts:57` reads `.bar select` directly, so removing `header.bar` breaks it even before the picker is replaced.


---

# Go server and storage inventory: First report

INVENTORY (read-only; I did not read docs/decisions.md or the spec sections, only code). Paths are relative to /Users/shardul/Documents/Github/DrawIt.

## 1. HTTP surface
Routes are in internal/server/server.go:36-45, built with `http.NewServeMux`, and wrapped by `protect(cfg, mux)`.
- `GET /api/files` (`s.list`, l.48-70). Returns 200 `{"files":[{path,size,modified}]}`. `fileInfo` is at l.24-28: `Path string`, `Size int64`, `Modified time.Time` (UTC). On a walk error it returns 500 "cannot list folder".
- `GET /api/file?path=` (`s.read`, l.83-105). Returns the raw bytes as `application/octet-stream`.
  - A bad path gives 400.
  - A missing file gives 404.
  - A non-regular file gives 400 "not a file".
  - Any other open error gives 403 "access refused" (`openFailed`, l.169-175).
- `PUT /api/file?path=` (`s.write`, l.107-137). Success is 204 with no body.
  - A body over the limit gives 413 "file is larger than the limit". It is detected with `http.MaxBytesReader` and `*http.MaxBytesError`, before any folder or file is created.
  - A body read error gives 400.
  - A path that is a folder gives 400 "path is a folder".
  - The write calls `root.MkdirAll(dir, 0o755)` for missing parent folders.
- `GET /api/` is `http.NotFound`, so an unknown /api path gives 404 and never falls through to the app (l.42).
- `GET /` is `http.FileServerFS(assets)` (l.43).
- Any other method on these routes is refused by the mux's 405 (test at server_test.go:318).
- There are no other endpoints: no config, session, prefs, watch/events, create, rename, delete or import endpoint.

Middleware is `protect` in internal/server/security.go:26-39.
- It sets headers on every response, including 403s:
  - `Content-Security-Policy` is `default-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` (const `csp`, l.22).
  - `Referrer-Policy: no-referrer`.
  - `X-Content-Type-Options: nosniff`.
- It then checks Host, Origin and token. A failure gives 403 "forbidden".
  - Host: `allowsHost` does a case-insensitive match against `Config.Hosts` (l.41-48).
  - Origin: `allowsOrigin` (l.51-61) accepts an absent header, or exactly one value of the form `http://<allowed host>`. Anything else, including `https://`, is refused.
  - Token: it applies only to paths with prefix `/api/`. `allowsToken` (l.63-69) requires `Authorization: Bearer <token>`, compared with `subtle.ConstantTimeCompare`. An empty `Config.Token` refuses everything. A token in the query string is not accepted.
- The static app is served without a token, but still behind the Host and Origin checks.
- `Config` (l.10-16) holds `Token` and `Hosts`, both fixed at startup.

Embedding is in internal/webui/webui.go.
- `//go:embed all:dist` (l.12).
- `Files()` returns `fs.Sub(dist,"dist/app")`.
- If the app folder is missing or empty it returns an empty `embed.FS`, so the server answers 404.
- Files are served with `http.FileServerFS`, so `index.html` is served at `/`.

## 2. Root selection today
cmd/drawit/main.go `run(ctx,args,out,open,ready)`:
- Flags are `-addr` (default `127.0.0.1:0`) and `-no-browser`.
- At most one positional `[folder]` is allowed; more gives "usage: drawit [-addr host:port] [-no-browser] [folder]" (l.46-48). The default folder is `"."` (l.49-52).
- Only host `127.0.0.1` is allowed (l.54-56).
- `os.OpenRoot(dir)` is called once (l.58) and deferred-closed, then `root.Stat(".")` must be a directory (l.63).
- The `*os.Root` is passed to `server.New(root, webui.Files(), cfg)` (l.80) and held in `server.root` for the process lifetime. There is no way to change it at runtime.
- There is no preferences file, no remembered folder, no `~/DrawIt` and no `os.UserConfigDir` anywhere (grep for UserConfigDir, trash and preferences finds nothing).
- Path validation is `filePath` (server.go:74-81). It requires `filepath.IsLocal(p)` and a cleaned path that is not `.`, and it uses the slash-cleaned form.
- Every access goes through `s.root.Open`, `Lstat`, `MkdirAll`, `OpenFile`, `Rename`, `Remove` and `FS()`. Symlinks that leave the root are therefore refused (403 on read and write).
- Atomic write is `replace` (l.141-165): a temp file `.<base>.tmp-<12 hex>` opened with `O_EXCL`, `Sync`, then `Rename`; the temp file is removed on failure.

## 3. Listing
- It is recursive (`fs.WalkDir(s.root.FS(), ".")`).
- Only regular files are listed (`d.Type().IsRegular()`). Directories and symlinks are skipped, so empty folders are invisible.
- There is no extension filter on the server. The front end filters `.drawit.kdl` in web/src/app/workspace.ts:11-15 (`FILE_EXTENSION`, and the line `(await storage.list()).map(f=>f.path).filter(p=>p.endsWith(FILE_EXTENSION))`).
- Fields are `path` (slash-separated, relative), `size` and `modified` (UTC, JSON RFC3339). Modified time is already in the listing.
- The temp files `.x.tmp-*` appear in the listing while a write is in flight.
- There is no pagination and no depth limit.

## 4. Operations
- Exist: list, read, atomic write with parent folders created implicitly, binary bytes (opaque octet-stream), and a 32 MiB limit (`MaxFileBytes = 32 << 20`, server.go:22) enforced with 413 on write only.
- Absent: create-new/exclusive, rename, delete, trash, mkdir endpoint, move or copy, import, folder-browser listing outside the root, preferences, a session or one-tab concept (the token is per process and any tab holding it works), and any watch, SSE or change endpoint.

## 5. Browser and token flow
- cmd/drawit/main.go:71-79: `newToken()` is 32 random bytes in `base64.RawURLEncoding` (l.109-115). `Hosts` is `127.0.0.1:<port>` and `localhost:<port>`. The URL is `http://127.0.0.1:<port>/#<token>`.
- l.84 prints `DrawIt is serving <dir> at <url>`.
- Unless `-no-browser` is given or `open` is nil, it calls `open(url)`. A failure prints "could not open the browser (...); open <url> yourself" and does not stop the run.
- `main()` wires `open` to `browser.Open(runtime.GOOS, url)`. internal/browser/browser.go: `Command` gives `open` on darwin, `rundll32 url.dll,FileProtocolHandler` on windows and `xdg-open` otherwise. `Open` starts the command and reaps it in a goroutine.
- `ready()` is a test hook.
- Shutdown is on `os.Interrupt`, with a 2 s graceful `Shutdown`, then `Close`.
- internal/scaffold/scaffold.go only has `const Name = "drawit"`.

## 6. Front-end storage (web/src/storage)
adapter.ts:
- `FileInfo {path; size; modified: string (ISO)}`.
- `MAX_FILE_BYTES` is 32 MiB.
- `WatchEvent = {type: "created"|"changed"|"removed"; path}`.
- `Unsubscribe`.
- `StorageErrorCode` is `"not-found"|"invalid-path"|"refused"|"too-large"`.
- `StorageError`.
- `assertFitsLimit`.
- `StorageAdapter` has only `list(): Promise<FileInfo[]>`, `read(path): Promise<Uint8Array>`, `write(path, data): Promise<void>` and `watch(listener): Unsubscribe`.
- Helpers `readText` and `writeText`.
- The header comment says `watch` "has no server endpoint yet".

http.ts: `HttpStorage({token, fetch?})`.
- Every request sends `Authorization: Bearer`.
- 404/400/403/413 map to `StorageError` codes; any other status throws a plain `Error`.
- `list` calls `/api/files`; `read` and `write` use `/api/file?path=` with `encodeURIComponent`.
- `write` runs `assertFitsLimit` before sending.
- `watch()` returns a no-op `() => {}` and never calls the listener.

memory.ts: `MemoryStorage(files, {now})`.
- It mirrors server cleaning (`clean`) and walk order (`walkOrder`).
- `write` emits `created` or `changed`.
- Test-only `remove(path)` emits `removed`.
- `watch` keeps a listener set.
- It also checks folder/file collisions.

session.ts: `startSession(env)` takes the token from the URL fragment, stores it in `sessionStorage` under `drawit.token`, strips the fragment with `history.replaceState`, and otherwise falls back to the stored token. It returns `string|null`.

Consumers:
- web/src/main.ts:3-12 builds `new HttpStorage({token})` and calls `startShell`.
- app/workspace.ts lists files and filters by extension.
- app/shell.ts:473 shows "No .drawit.kdl files in this folder."
- Other `StorageAdapter` users are images/store.ts, images/add.ts, images/input.ts.
- No code uses `watch()` or polls `modified`. The `watch` and `setInterval` searches in main.ts, workspace.ts and shell.ts returned nothing.

## 7. Tests
Go, internal/server/server_test.go:
- List: recursive in path order; empty folder gives `[]`; skips symlinks.
- Read: returns bytes; missing gives 404; a directory is refused.
- Write: create/replace; creates folders; leaves no temp files; failed write keeps the old file; writing over a directory is refused.
- Paths: outside-the-folder paths refused; missing `path` param refused; a symlink out cannot be read; writing through a symlink never touches the target.
- Methods and routing: unsupported methods refused; serves the embedded app; unknown `/api` gives 404, not the app; app assets are not readable as workspace files.
- Binary round-trip; a write of exactly the limit is accepted; over the limit gives 413 and keeps the old file; over the limit creates no folders.

Go, internal/server/security_test.go:
- Unexpected Host refused; listener hosts accepted.
- Foreign Origin refused; own Origin accepted.
- The API requires the token header; a token in the query string is not accepted.
- A refused write changes nothing.
- A server without a token refuses the API; the app loads without a token.
- Every response carries the security headers.

Go, cmd/drawit/main_test.go (helper `start`):
- Serves the folder and opens the browser; writes files into the folder; `-no-browser`.
- Defaults to the current folder.
- Refuses a missing folder, a file instead of a folder, more than one folder, and non-loopback addresses; listens on 127.0.0.1 by default.
- The token travels in the URL fragment; each run has its own token.
- A running server refuses requests without the token, and a foreign Host or Origin; it sends the security headers.
- Run stops even with an open connection.

Go, others: webui `TestFilesIsAReadableFolder`; browser `TestCommandPerPlatform`; scaffold `TestModuleBuilds`.

TS, memory.test.ts (about 18 cases):
- Empty list.
- Read-back, initial text/bytes.
- Listing path/size/modified, in walk order and regular files only.
- Write replaces and updates size/modified; creates folders.
- Missing read gives not-found; path cleaning; folder vs file collisions.
- Copy semantics; binary round-trip; limit exact and over by one.
- UTF-8 text helpers.
- watch: created/changed/removed, cleaned path, multiple listeners and unsubscribe, and no event for a refused write.
- `remove` of a missing file gives not-found.

TS, http.test.ts:
- list with bearer token.
- read with the path encoded.
- write with PUT and bearer token.
- Binary bytes unchanged.
- No send over the limit.
- Error status mapping and a plain Error for other statuses.
- watch is a no-op.
- startSession: fragment stored and stripped, fallback to session storage, null when nothing, a new fragment replaces the stored one.

## 8. Gaps against the target (numbered)
1. Library folder and projects: there is no `~/DrawIt` notion and no project concept. A project is today just a subfolder in a flat recursive listing.
   - Needs: a library path resolver and a project-aware listing in internal/server (new file, e.g. library.go), plus a startup rule in cmd/drawit/main.go.
2. Create/rename/delete with trash: there is no endpoint, and no `Remove` or `Rename` is exposed to clients. `os.Root` has `Remove` and `Rename`, but no OS trash exists.
   - Needs: new routes in internal/server/server.go, a trash helper (new package, per-OS) and confinement of the library folder for these operations. Adapter methods in web/src/storage/adapter.ts, http.ts and memory.ts, where `MemoryStorage.remove` is currently test-only and not on the interface.
3. Import: there is no copy-in. It needs a route taking a source path outside the root, an exception to the "no reads outside" rule, and 32 MiB enforcement. Touches server.go and a new adapter method.
4. Folder browser listing: there is no listing outside the root. `list` only walks `s.root.FS()`, and the root is opened with `os.OpenRoot`.
   - Needs: a name-only directory lister over arbitrary absolute paths (no file reads). It should show folders and `.drawit.kdl` names. New handler plus an adapter type, and a decision on how it fits with the token and the `/api/` prefix.
5. Runtime root switching: the root is a single `*os.Root` captured in `server{root}` at `New` time, so it cannot be swapped. `Config.Hosts` is also fixed at startup, which is fine.
   - Needs: a mutex-guarded or atomic root holder, a `POST` route to open a folder, closing the old `os.Root` safely against requests in flight, and a "no folder yet" state for the start screen. Touches server.go and main.go. `run` currently fails when the folder is missing or not a directory, and defaults to `"."`.
6. Last-folder memory and preferences JSON: there is no code at all. It needs a new package (e.g. internal/prefs) using `os.UserConfigDir`, read/write of JSON with unknown keys kept (decode into `map[string]json.RawMessage`), and an unreadable file left untouched. main.go folder resolution must become: CLI arg, else remembered folder, else start screen. The default is currently `"."`.
7. Change detection by polling: the listing already carries `modified` (UTC, nanosecond-precision RFC3339), so a poll of `/api/files` can detect changes.
   - Caveats: the listing is a full recursive walk on every poll, which is costly for a large library and wasteful for a single file.
   - There is no cheap single-file stat endpoint, so a poll of one open file needs either that endpoint or a listing.
   - Temp files `.*.tmp-*` appear in the listing.
   - `watch()` in HttpStorage is a no-op; it would need a poller and the events (`created|changed|removed`) computed by diffing. The `MemoryStorage` semantics already exist.
   - Touches http.ts, adapter.ts (comment/contract), plus server.go if a stat route is added.
8. One-session takeover: the token is per process and static (main.go:71). Any number of tabs may use it, and `sessionStorage` is per tab.
   - Needs: a session id or epoch held by the server, a take-over route that rotates it, and a way for the old tab to learn it lost (an error code on API calls, e.g. a new `StorageErrorCode`). Touches security.go (token check), server.go, session.ts and http.ts. Today the URL is printed with the token fragment and a second tab opened with the same URL simply works.
9. Drafts: there is nothing. It needs a Drafts project in the library, creation on demand and promotion or move to a named project (rename or move support from gap 2).
10. Listing contract: the app learns the file list from `GET /api/files`, which is recursive over all regular files. For the landing page and projects it needs per-project or per-folder listing, and directory entries so that empty projects can be listed (directories are currently skipped).

## 9. Conflicts with existing behaviour
- `server.root` fixed at construction; the doc comment says "one opened folder" (server.go:1-3, 30-37).
- `run` aborts if the folder is bad or missing, and defaults to the current directory. The usage string and the `Fprintf` "serving %s" assume a folder at start.
- Tests `TestRunDefaultsToTheCurrentFolder`, `TestRunRefusesAFolderThatDoesNotExist` and `TestRunRefusesAFileInsteadOfAFolder` encode the old startup rules.
- `filePath` rejects directories and `.` for read and write, and the error text says "inside the folder". Folder operations (rename, delete of a project) need a separate path rule.
- `write` implicitly creates parent folders (`MkdirAll`) on every PUT, so a PUT can create arbitrary new folders, including a project, which conflicts with "only the library folder can create projects".
- The write path also lets any client write any file name or extension. There is no `.drawit.kdl` restriction on the server.
- The listing includes every regular file and leaks in-flight temp files.
- web/src/app/workspace.ts and shell.ts assume one flat `list()` source and one extension filter. The "No .drawit.kdl files in this folder." message assumes a fixed folder.
- `HttpStorage` has no way to learn the root changed.
- `MemoryStorage.remove` is not on the `StorageAdapter` interface, and memory.ts and http.ts must be kept behaviourally identical (the memory test names "as the server does").
- The `Origin` check accepts only `http://` with the exact listener host, so it is fine for takeover, but `Hosts` is derived from the port at startup.
- The CSP `img-src 'self' blob:` and `connect-src 'self'` are compatible with polling. Folder browsing and trash happen server-side, so the CSP does not need to change.
- main.go prints the token URL once, and a second tab or a takeover would need the same URL again or a handoff.


---

# Go server and storage inventory: Corrected report, after reading decisions.md and the spec in full

Follow-up report. I changed no file.

## (1) Read in full
- docs/decisions.md, all rows: D1-D12, F1-F28, A1-A33, E1-E83, Q1-Q21, L1-L3, O1-O5.
- Spec sections 4.1, 4.3, 4.5, 4.6, 4.7, 5.3, 5.6, 5.7, 5.8, 6.1, 6.2 and 7.1-7.3. I did not read 4.2 or 4.4, which you did not list.
- ui-mockups.html: the state notes at lines 54-86, plus the `pcard(name, count, modified, thumb)` helper at line 31. The states covered are First run, Project, Opened folder, Drafts, Delete, Delete (no trash), Import, Import refused, New diagram, Rename, Move to project, Unsaved work, Folder browser, Editor, Another tab, Changed on disk and Preferences.

## (3) What the full reading changes in sections 1-7
- **Section 3 (listing).** Section 3 stands as written, but E45 says the landing page lists only the top level of the folder, because a recursive walk reaches `node_modules`. The current `GET /api/files` walks recursively (server.go:50) and the front end filters by extension (workspace.ts:15). Recursion is a conflict for opened folders, not a feature.
- **Section 1 (CSP).** F12 says fonts are bundled, A26 says images load from blob URLs, and A18 says packs are bundled. These match the CSP and the `//go:embed all:dist` embed. Nothing changes.
- **Section 4 (limit).** A25 says the limit applies to every write. This matches the code. Import (E55) adds a copy that must also respect it.
- **Section 5 (printed URL).** Spec 6.2 says the tokened URL is "also printed to the terminal". This matches main.go:79-84.
- **Section 6 (watch).** A30 replaces the watch idea with polling. The `watch()` method and `WatchEvent` in adapter.ts are therefore an unused abstraction. The interface should expose what polling needs: a cheap stat of one file, and a hash comparison done by the app.
- **Section 7 (tests).** `TestRunDefaultsToTheCurrentFolder` and the "folder does not exist" tests encode an order of folder choice that E47 replaces. The order becomes the command line, then the preferences file, then the start screen.

## (2) Corrected section 8: gaps, by decision
Nothing exists for any item below unless I say so. Existing code is `GET /api/files`, `GET` and `PUT /api/file`, the fixed `os.Root`, the token, Host/Origin checks and the CSP.

1. **A1, A4, 6.1 (adapter and server).** The adapter has only `list`, `read`, `write` and `watch`. The server owns the library and the folder browser, but has no code for either. Files: `adapter.ts`, `http.ts`, `memory.ts`, `server.go`.
2. **A5, A7, A28, 5.6 (one folder at a time, runtime switching).** The root is a `*os.Root` fixed in `server{root}` at `New` time, and `main.go` opens it once. Missing:
   - a guarded root holder;
   - a route to switch the served folder and a "no folder yet" state;
   - safe closing of the old root while requests are in flight;
   - a way for the client to learn the workspace kind (library, project or opened folder), because E51 sets the autosave default from it.
   Files: `server.go`, `main.go`, `adapter.ts`.
3. **A6, 6.2 (security).** This is present and correct: loopback, token in the fragment, Host/Origin, CSP, no-referrer, `os.Root`. Gaps:
   - the new library, browser and preferences routes must sit behind the same `protect` wrapper;
   - confinement has no exception path yet for the library, the browser and the preferences file.
   Files: `security.go`, `server.go`.
4. **A14, A31-A33, E35, E46 (preferences).** There is no preferences code. Needed:
   - JSON in `os.UserConfigDir()`, with unknown keys kept as `map[string]json.RawMessage`;
   - an unreadable file left untouched, with defaults used;
   - routes to read and write it;
   - the last project or folder, and recent files per folder.
   E35 says recent colours stay in the session until this exists. New package, e.g. `internal/prefs`, plus adapter methods.
5. **A25, 413 (limit).** The write refuses over 32 MiB with 413 (server.go:112-116), and the adapters refuse before sending. This is complete. Import (E55) needs the same limit on its copy.
6. **A26 (images).** The CSP has `img-src 'self' blob:`. Reads go through the adapter and `fileUrl`. Relative paths resolve only inside the served root, so a project's `assets/` works if the project is the served root. No gap.
7. **A27, E60, 6.2 (folder browser).** Missing. It must list only the names of folders and `.drawit.kdl` files, starting at the home directory, read no file, and be guarded by the token. It also needs "New folder" (E60), which is a write outside the served root. Files: new `internal/server/browse.go`, adapter method.
8. **A28, E52 (library).** Missing:
   - `~/DrawIt` created on first run;
   - listing projects;
   - creating, renaming and deleting projects and diagrams.
   The server today refuses to touch anything outside the root, and no endpoint renames or removes.
9. **E54 (rename and delete with trash).** There is nothing here: no `Remove` or `Rename` route, no OS trash helper (macOS, Linux, Windows) and no signal for "no trash, ask twice". Files: new `internal/trash`, `server.go`, adapter.
10. **E55 (import).** Missing: an endpoint that copies a chosen file into a project. The browser can send the bytes, so no read outside the root is needed. The server must parse KDL and return line and column, which means a Go KDL parser or the front end doing the check, and must rename on a name clash.
11. **E53, E74, E76 (Drafts, naming, project names).** Missing:
   - a `Drafts` project created on demand;
   - "Untitled" and "Untitled 2" naming;
   - moving a draft to a project, which needs rename or move across folders inside the library;
   - server validation of the project-name charset;
   - case-insensitive clash detection.
   The existing `PUT` neither refuses an existing name nor checks name rules. `MkdirAll` lets any PUT create any folder, including a project.
12. **A29, 5.6 (one session, takeover).** Missing. The token is static per process, so a second tab with the same URL works silently. Needed: a session id on the server, a "Use here" route that rotates it, and a distinct error for the old tab (new `StorageErrorCode`). Files: `security.go`, `server.go`, `session.ts`, `http.ts`.
13. **A30, E3, 5.6 (change detection).** `watch()` is a no-op in `HttpStorage`. The listing carries `modified` (UTC, RFC3339 with fractional seconds), so the polling data exists. Missing:
   - a stat for one open file (a full recursive walk every second is wasteful);
   - the front-end poll loop;
   - a temp-file filter, because `.<name>.tmp-<hex>` files appear in listings;
   - the content-hash comparison, in the app.
   Files: `server.go`, `adapter.ts`, `http.ts`.
14. **E43, E44, E45 (landing page).** Missing: a top-level-only listing, including directories, so that empty projects and sub-projects can be shown. Today the list is recursive and files only.
15. **E47, E70, 5.6 (opening).** Missing: the order of command line, then preferences, then start screen. A server that starts with no folder must serve the app and the library, browser and prefs routes only. Files: `main.go` and the server's "no root" state.
16. **E48 (exports).** No server involvement is needed and none exists. No gap.
17. **E51 (autosave default).** The client needs the workspace kind from the server (see item 2), plus a preference stored in the file (item 4).
18. **E56-E59 (cards and thumbnails).** The app needs, per project, the diagram count, latest modified time and the latest diagram's bytes. See the specific question below.
19. **E75 (switching with unsaved edits).** Entirely front end, but the server switch route must not drop an in-flight write. The client must save or discard before switching.
20. **A3, A12, E1, 4.6 (saving).** `PUT` is atomic and fine. A write that races a switch of the served folder must fail cleanly.

## Corrected section 9: conflicts with existing behaviour
- **`server.root` is fixed at construction.** Both the package comment (server.go:1-3) and the `server` struct assume one root for the process.
- **`run` in `main.go`.**
  - It defaults to `"."` and aborts if the folder is missing. E47 wants the start screen when there is no folder.
  - Its usage text and its "DrawIt is serving %s" message assume a folder at start.
  - The tests `TestRunDefaultsToTheCurrentFolder`, `TestRunRefusesAFolderThatDoesNotExist` and `TestRunRefusesAFileInsteadOfAFolder` encode the old rules.
- **`GET /api/files` is recursive and files-only.** It conflicts with E45 for opened folders, and it hides empty projects.
- **`PUT /api/file` creates any parent folders and any file name.** It conflicts with A28 and E76 (projects are created by the library routes only, with validated names) and E74 (a name that exists is refused).
- **`filePath` rejects directories.** Folder operations (rename or delete of a project) need their own path rule.
- **`StorageAdapter.watch` and `WatchEvent`** assume a push model, but A30 rejects events and a WebSocket in favour of polling.
- **`MemoryStorage.remove`** is test-only, and the interface has no delete. `MemoryStorage` must grow the same new methods so the two adapters stay identical.
- **`workspace.ts` filters by extension and `shell.ts` shows "No .drawit.kdl files in this folder."** Both assume the front end learns the file list from one fixed source. Project and start-screen lists need a new source.
- **The token is static and per process.** It does not support A29's takeover.
- **`session.ts`** reads and stores only the token. Nothing there tells the app that it has lost the session.

## Specific question: serve the library folder on the start screen, then switch to a subfolder on opening a project
**What this needs from the server:**
1. **Library as root.** The server must be able to open `~/DrawIt` as the served root and create it if missing. The existing `GET /api/files` already returns every regular file with `path` (e.g. `Home network/a.drawit.kdl`), `size` and `modified`. From that, the app can compute each project's diagram count (`.drawit.kdl` files directly in that folder) and latest modified time, and it can read the latest diagram's bytes through `GET /api/file` for the thumbnail. No new read route is needed for these three values.
2. **Directory entries.** Empty projects only appear if the listing includes directories, or a separate "list the top-level folders" route exists. A project with no diagrams is invisible today.
3. **Cost.** The recursive walk reaches every project's `assets/` and every diagram, so with 1 s polling (A30) it costs a full walk each second. A top-level-only listing, or a library listing that returns one summary entry per project, is cheaper. It would need the count and the latest modified time computed in Go.
4. **Switch route.** A route changes the served folder to `~/DrawIt/<project>`, and one returns to the library. The first needs the same name validation as E76. Opening a project this way makes the project the root, so `assets/` and relative image paths resolve (A26, F10). The thumbnail's images resolve only if the app reads them with the library as root, so a thumbnail of a diagram with images needs paths relative to the library root: the file is read from `Project/a.drawit.kdl`, and its images from `Project/assets/x.png`. With the library as root this works. The client must resolve the image path against the diagram's folder.
5. **Workspace kind.** The server must report which kind of root is served (library, project, opened folder) so that autosave (E51) and the card menus (E59) follow it.
6. **Rename, delete and import.** Operating on projects while the library is the root fits `os.Root`. Operating on a diagram inside a project is a path inside the same root only when the library is served; when a project is served, rename and delete of that project's own folder would have to leave the root. Either those actions happen only from the start screen (library root), or the server needs library access beside the project root (A28 says it does).
7. **Drafts.** `Drafts` is a project like any other, so it is a subfolder of the root and the same switch applies.
8. **Poll.** The start screen refreshes its listing (A30) from the library listing, and the editor polls a single file after the switch.

**What the storage layer needs:** a `list` that can take a folder and a depth (or a separate `listProjects`), a `switchFolder(path)` (or equivalent), `currentFolder()` with its kind, create and rename and delete and import methods, `stat(path)` for polling, and the preferences methods. The error codes need `session-lost`. `MemoryStorage` must mirror all of it.

**Risk to flag:** a switch while a write is in flight, or while the old tab holds unsaved edits (E75). The client owns the save-or-discard; the server only needs to finish or fail pending writes before closing the old root. A29 (one session) is what makes a server-side switch safe, because no second tab can write to a different folder than it expects.


---

# Model, commands and renderer inventory: First report

Inventory of /Users/shardul/Documents/Github/DrawIt/web/src (read-only; docs/decisions.md and the spec were only grepped, not read). Line numbers are exact where given, otherwise function names.

## 1. Model and KDL API
- `model/index.ts:10` `DiagramDocument { version; title?; plugins: PluginRef[]; comments?; elements: DiagramElement[]; style: Style; layout: LayoutEntry[] }`. Layout array order is z-order.
- `model/structure.ts`: `ID_PATTERN`, `isValidId(id)`, `unusedId(elements: readonly {id}[], base): string` (:11, gives `base`, `base-2`, ...). Element kinds: `node`, `frame`, `edge` (`from`/`to: string|null`, `label?`), `text`, `image` (`src` relative to `assets/`), `shape`, `unknown`. All elements except unknown carry optional `class`, `comments`, `ext`.
- `model/style.ts`: `Style { theme: Theme; classes: StyleClass[]; overrides: ElementStyle[]; unknown? }`. `Theme` has `colors/fonts/sizes/spaces` records. `StyleProps` can hold `$token` refs (`TokenRef`).
- `model/layout.ts`: `LayoutEntry { id,x,y,w?,h?,locked?,from?,to?,fromPoint?,toPoint?,via?,labelAt?,ext? }`.
- `model/lookup.ts`: `elementsById(doc)`, `layoutById(doc)`.
- `kdl/read.ts:333` `readDiagram(text): { document, warnings }`. It throws `KdlSyntaxError(line, column)` (:19). Only KDL syntax is checked, and it does not check that the text is a DrawIt document. Any valid KDL parses, and unknown nodes become `UnknownElement`.
- `kdl/write.ts:159` `writeDiagram(document): string` (canonical). It writes only layout entries whose element exists. It writes the whole `style` (all classes, all overrides, theme tokens). It always emits the `diagram` header with `version` and `title`.
- Subset serialisation: none. No function builds a "selection plus needed classes" document, and none parses text into a mergeable fragment. The only way today is to build a `DiagramDocument` by hand and call `writeDiagram`. The reader always returns a complete document, and nothing merges two documents.
- Related: `app/workspace.ts` has `FILE_EXTENSION = ".drawit.kdl"`, `workspaceFiles(storage)`, class `OpenFile {path, history, document, dirty, save(storage)}`, and `openFile(storage, path, measurer): OpenResult` (read, `readDiagram`, `placeUnplaced`). `OpenFile.dirty` compares `writeDiagram` output with the saved text on every call.

## 2. Command layer (`commands/command.ts`)
Commands:
- `add` (`items: {element, layout?}[]`, appended in order; `checkNewId` throws on a taken or invalid ID, but allows derived edge IDs `a->b`).
- `delete` (`ids`; edges that stay get a free end at the deleted element's layout centre; also drops layout entries and `style.overrides`).
- `setElement` (`set`/`unset` of label, name, content, src, shape, class, from, to).
- `setLayout` (per-ID `set`/`unset`; creates the entry if missing).
- `setStyle` (target `{kind:"class",name}` or `{kind:"el",id}`; creates the class if missing, `command.ts:~187`).
- `reorder` (front or back).
- `rename` (ID in structure, style and layout).
- `batch` (`commands: Command[]`, the doc comment already names paste as a use).
- `applyCommand(doc, cmd): {document, patches, inverse}` (:272) and `applyPatches` (:280), both Immer.

Duplicate and delete are pure functions that return one `Command`:
- `edit/duplicate.ts` `duplicateCommand(doc, measurer, ids): {command, selection} | null`, with `DUPLICATE_OFFSET = 16`.
  - IDs: a private `fresh()` uses `unusedId` against `[...doc.elements]` plus IDs already issued. The base is the shape name without its pack prefix, or the element kind (`baseId`).
  - Edges: an edge is copied if it is selected, or if both its ends are copied nodes. An end on a copy is remapped. Any other end becomes `fromPoint`/`toPoint`, taken from `routedEdges` (the routed path end), or from the existing free point, shifted by the offset. An edge with an end that cannot be located is skipped. The edge ID is `a->b` when both ends are copied and the ID is free, otherwise `fresh("edge")`.
  - Per-copy fields: copies drop `comments` and `locked`. `via` points are shifted. Per-element style overrides are re-issued as `setStyle {kind:"el"}` in a `batch`.
  - Classes: copies keep `class` by name only. This is correct inside one document and is wrong across files, because nothing copies the class definition.
- `edit/delete.ts` `deleteCommand(doc, measurer, ids): Command | null`. It skips locked elements. It pre-frees surviving edge ends with `setElement` (end set to null) plus `setLayout` (point), then emits `delete`, all in a batch.
- `edit/input.ts` `attachEditInput`: keydown for Cmd/Ctrl+D (duplicate), Cmd/Ctrl+Shift+A (select inside), Cmd/Ctrl+Shift+L (lock), Delete/Backspace. It runs `file.history.execute(cmd, {selection})` then `host.refresh()`.
- Other builders: `edit/arrange.ts`, `edit/stacking.ts`, `edit/lock.ts`, `style/commands.ts`, `library/place.ts`, `frames/place.ts`, `images/add.ts` (`addImage` writes the file to `assets/` through the storage adapter, then returns an add command).
- Clipboard code: none. Grep for clipboard, ClipboardEvent, copy and paste finds nothing in `src`. Reusable for paste: `unusedId`, the `add` command with `items`, `batch`, `duplicateCommand`'s edge/free-end logic (`routedEdges`) and `baseId`, and the delete logic. None of it is exported as a helper that takes a foreign fragment.

## 3. Selection and history
- `commands/history.ts:29` `class History { document; selection: string[]; execute(cmd, {selection?, group?}); undo(); redo(); canUndo; canRedo }`.
- Each `Step` stores `patches`, `inverse`, `selectionBefore` and `selectionAfter`. `execute` keeps the selection when `options.selection` is absent. `undo` and `redo` restore the stored selection, so a paste that passes `{selection: newIds}` is undone and redone correctly.
- Same-`group` steps merge within `pause` (1000 ms by default).
- Selection is a plain `string[]` of IDs, per open file, and is not in the document. Sibling modules: `select/select.ts` and `select/input.ts`.

## 4. Renderer
- `render/describe.ts:266` `describeDiagram(doc, measurer, options?: {only, packs, hideText, images, plain}): SvgNode[]`.
  - `SvgNode = {tag, attrs, children, text?}` is plain data and needs no DOM.
  - It returns one `<g data-id transform=translate(x y)>` per element in `stackOrder` (z-order), edges included.
  - It has no viewBox, no size and no viewport dependence. It works in world coordinates, so it is independent of zoom and pan.
  - `only` renders a subset by ID. For a selection export, edges attached to elements outside the set would still need handling.
- `render/mount.ts` has `mount(root, groups)` and `patch(root, groups)`. They turn `SvgNode` into DOM via `document.createElementNS` and keep caches. There is no `SvgNode`-to-string serialiser. A string needs a new one or an `XMLSerializer` on a detached element.
- Pan and zoom are applied only in the shell. `canvas` is an `<svg>` with `defs` and a `world` group whose `transform` is `viewTransform(view)` (`view/view.ts`), and `elements` and `overlay` groups inside it (`app/shell.ts:~148`, `redraw` at :185-200).
- Bounds: `view/view.ts` `documentBounds(doc, measurer)` uses `drawnBoxes` (`render/boxes.ts:57`). Edges and unknown elements are not included. A frame's name is drawn one line above its box (`render/frame.ts:frameName`), outside its box, so a frame export needs an extra top margin. `elementBox(doc, el, entry, measurer)` gives a single box.
- Defs: `render/defs.ts:98` `describeDefs(doc): SvgNode[]` builds `linearGradient` and `filter`+`feDropShadow` nodes for the whole document, deduped by value-derived ID. Its header comment says "an export can take the same nodes". It has no per-subset variant. It is cached by `doc.style` and `doc.elements` identity. `fillPaint` and `shadowFilter` return `url(#id)`.
- Text:
  - `text/measure.ts` `createTextMeasurer(context?)` uses `document.createElement("canvas").getContext("2d")`, with `ctx.font` set from `fontShorthand`. Results are cached per font and text. `TextMeasurer {wrap(text,width,style), width(text,style)}`. `text/wrap.ts` has `breakLines`.
  - SVG text uses explicit `tspan` lines from `lineNodes` (describe.ts:98), so the layout is baked in and does not depend on browser wrapping. `svgTextAttrs` sets `font-family`, `font-size`, `font-weight`, `font-style`, `text-rendering`.
  - Measuring needs a 2D canvas context and the fonts loaded before the first measure (`loadFonts` must have resolved). Otherwise fallback-font widths are cached permanently.
  - `testing/measurer.ts` has `monoMeasurer` and `sizedMeasurer`, which need no DOM.
- Images: `render/images.ts` has `ImageLookup = src => {status:"loading"} | {status:"ready", url, w, h} | {status:"failed"}`, plus a global `openImages` set by `useImages`. `describeDiagram` takes `options.images`, so a different lookup can be injected. `images/store.ts` `ImageStore` reads bytes via `storage.read`, makes a blob URL, and decodes with an `Image` element. The state is keyed by resolved path, and `setBase(diagramPath)` forgets the old base. Only the URL is kept, not the bytes, so a data-URI lookup needs a new `ImageLookup` that reads bytes. `images/path.ts` has `imageMime(path)` and `resolveAsset(diagramPath, src)`. The `image` node is `<image href=file.url preserveAspectRatio="none">`.
- Pack shapes: `describeDiagram` takes `options.packs: ShapeSource` (default `bundledLoader`). `packs.drawing(name, size)` returns a `ShapeDrawing {svg: SvgEl, box, outline, anchors, filled}`. `packShapeNode` (describe.ts:140) turns it into nodes, with `roleAttrs` for fill and stroke roles. Bundled packs come from `shapes/bundled-packs.ts` (`import.meta.glob` of `../../../packs/*/pack.json` and `*.svg` with `?raw`). Pack shape SVGs are inline geometry, so they export as-is.
- Frames: `body()` case "frame" draws a rect plus a name line above it via `frameName`. A frame is an ordinary element with z-order, and it does not clip or own children in the model. "Elements inside a frame" must be computed geometrically (cf. `edit/select-inside.ts`).
- Paper colour: `themeColour(doc, "paper") ?? "#ffffff"` is used for edge label backgrounds. The canvas background itself is CSS, not part of the render tree.

## 5. Fonts
- `text/fonts.ts`: `FONT_FAMILIES` = Inter, Source Serif 4, JetBrains Mono. `FONT_FACES` is every family x script (latin, greek, cyrillic) x weight (400, 700) x italic: 36 faces. Files are woff2 from `/node_modules/@fontsource/*/files/*.woff2`, via `import.meta.glob(... ?url)`. The header comment says "so the same bytes can be embedded in SVG export".
- `loadFonts(set = document.fonts)` registers `FontFace` objects with `unicodeRange` and `display: "block"`, and awaits all of them.
- Nothing embeds fonts into SVG. There is no base64 or data-URI code and no used-font detection. A document's used font and weight come from `style/text-look.ts` (`textLookOf`, `textLookFor`), and `family` falls back to `"Inter"` when the font value is not one of the three families.

## 6. Export, PNG and download
Grep finds none of: `toBlob`, `createObjectURL` outside `main.ts`/`images`, `XMLSerializer`, `drawImage`, anchor-download. The only blob URL code is `ImageStore` options (`createUrl`, `revokeUrl`) and `images/add.ts` `measureInBrowser`. There is no canvas rasterisation other than the measuring context.

## 7. Library previews and lazy rendering
- `library/preview.ts` `describePreview(entry, packs, measurer)` builds a one-node `DiagramDocument` and calls `describeDiagram` with `hideText`. `library/sidebar.ts` creates a small `<svg viewBox>` per entry and uses an `IntersectionObserver`. On first intersect it calls `mount(svg, nodes)` and then `unobserve`.
- That is the pattern for a lazy thumbnail: a detached `<svg viewBox>` plus `mount(describeDiagram(...))`. `describeDefs` would also need mounting into a `<defs>`, which the library skips because it has no fills that need it.
- There is no cache keyed by path or modified time anywhere. The only caches are in the measurer, the mount caches, `describeDefs` and `stackOrder`.
- A thumbnail of another file needs `openFile`-style reading without making it the open file. Its image lookup would have to be per file, because the global `openImages` is one lookup (`useImages` sets a single `current`).

## 8. New document, names, recent files
- No code creates an empty document or file. The only empty-document literals are in `kdl/read.ts` (`readDiagram` initial) and `library/preview.ts` (preview doc).
- No default names and no recent-files tracking. The grep for untitled, recent and localStorage found nothing in `src`.
- `app/shell.ts` has a `<select>` picker over `workspaceFiles(storage)`, and `Shell` exposes `open(path)` and `save()`.
- `StorageAdapter` (`storage/adapter.ts`) is `list(): FileInfo[] {path,size,modified (ISO)}`, `read`, `write` (creates files and folders), `watch`. `MAX_FILE_BYTES` = 32 MiB. `FileInfo.modified` exists, so a thumbnail cache key of path plus modified is possible. `storage/memory.ts` is the test adapter. `storage/http.ts` is the real one.
- `storage/session.ts` holds the session token only. A write to an existing name overwrites silently, so "unused name" needs `list()`.

## 9. Performance tests
- `e2e/*-perf.spec.ts` for drag, connector, pack, styled, labelled-edges and frames-images, with `src/perf/*.ts` harnesses served from root HTML pages (`drag-perf.html`, `connector-perf.html`, `text-wrap.html`), plus the tests tagged `@budget`.
- `e2e/frame-measure.ts`: `FRAMES = 120`, one `pointermove` per animation frame, recording the gap between animation frames and script time. `MISSED_MS` = 1.5 x 16.67 ms. `MAX_MISSED_SHARE` = 0.05. The first 10 frames are dropped. `percentile` and `missedShare` log p50, p95 and max.
- `e2e/frame-budget.ts` skips the budget tests on CI WebKit (software raster).
- Data comes from `testing/generate-diagram.ts` (`generateDiagram({count: 500, seed, ratios, shapes})`), 500 elements.
- Tests assert more than timing. Examples are "redraws only its own edges and measures no text again" (labelled-edges) and shadow limits (`SHADOW_DRAG_LIMIT = 5` in `render/defs.ts:10` drops filters during drags).
- A thumbnail, export or paste that runs synchronously on the main thread during a drag would show up here. Every perf test measures drag or resize only, and none measures idle scroll, file switching or key commands.

## 10. Gaps against the target
Clipboard:
1. No subset serialiser (selection plus needed classes to a complete document). Needs a function that takes `DiagramDocument` and IDs and returns a `DiagramDocument`, then `writeDiagram`. New module under `edit/` or `kdl/`. The needed classes come from `class` names, plus any `$token` references in those classes' props, because theme tokens live in `style.theme` (a paste must also bring or resolve those).
2. No fragment merge. `duplicateCommand` is hardwired to one document. A paste builder needs: ID remap with `unusedId` against the target; the edge rule (both ends copied: keep; one end: free end with `fromPoint`/`toPoint`, and the position of an attached end must come from the source's routed path, which needs `routedEdges` on the source doc); class copying (missing classes appended as `setStyle {kind:"class"}`; name clashes between differing definitions are unspecified); landing at the pointer (translate the layout). Candidates to share with `edit/duplicate.ts`: `baseId`, `moved`, the ends loop.
3. Paste of image elements needs the asset bytes. `src` is relative to `assets/`, and the clipboard text holds no bytes. `images/add.ts` would need a path to copy or reference the file. Unspecified in code.
4. No clipboard events. `edit/input.ts` handles keydown only. `copy`, `cut` and `paste` listeners on `window` (guard with `isTextEntry`, `app/text-entry.ts`) are needed, with `clipboardData` text, or `navigator.clipboard`. Non-DrawIt text must be ignored: `readDiagram` accepts any KDL, so a validator that checks for the `diagram` header and rejects unknown-only content is needed.
5. Cut = copy + `deleteCommand`, but `delete` skips locked elements. The history `selection` option is available for the result.
6. The `Command` and `History` layers need no change.

Export:
7. No SVG-string output. Needs a `SvgNode`-to-string serialiser (a pure function, so it can be tested without a DOM) and a wrapper that writes `<svg xmlns viewBox width height>`, `<title>`, `<desc>`, `<defs>`, then groups. New module under `render/` (for example `render/export.ts`).
8. Bounds. `documentBounds` ignores edges (routed paths, labels, arrowheads) and frame names. Export bounds need edges, line width, shadow extent and frame names. `routedEdges` gives the points. Touches `view/view.ts` or `render/boxes.ts`.
9. Subset export. `describeDiagram.only` selects by ID. Defs are whole-document, and `describeDefs` has no `only` (`render/defs.ts`). A frame export needs the geometric containment from `edit/select-inside.ts` as the ID set.
10. Font embedding. Needs used-font and weight detection (walk the nodes' `font-*` attrs or each element's `textLookFor`), fetch of the woff2 bytes from `FONT_FACES[].url`, base64 `@font-face` in a `<style>` with `unicodeRange`. Touches `text/fonts.ts`.
11. Image inlining. `ImageStore.lookup` gives blob URLs. A data-URI `ImageLookup` is needed, injected through `describeDiagram` `options.images`. The store's `#load` is async, so export must `await` loading. `storage.read` plus `imageMime` is enough.
12. PNG: nothing exists. Needs SVG to `Blob` URL to `Image` to `<canvas>` at 1x/2x/3x, `toBlob`, and a transparent-background option (the canvas background is CSS, and a "paper" rect would have to be added or omitted). Canvas size limits must be detected and refused. Image-in-SVG-in-`<img>` cannot load external URLs, so the images and fonts must be data URIs.
13. Download: nothing exists. Needs an anchor with `download` and `createObjectURL` in the shell.
14. Measurer: export needs the real canvas measurer with fonts loaded (already true in the shell). It is DOM-bound, so headless tests use `monoMeasurer`.

Thumbnails:
15. `openFile` makes an `OpenFile` with a `History`. A thumbnail needs a lighter read-parse path that returns a `DiagramDocument` or a failure, and an explicit size check against the file size from `list()`. `workspace.ts` is the module.
16. Per-file image lookup. `openImages` is a single global, so a thumbnail must pass `options.images`. It can probably use "no images" or placeholders for cheapness.
17. Cache keyed by path plus `FileInfo.modified`, and lazy `IntersectionObserver` rendering that mirrors `library/sidebar.ts`. A viewBox from the item 8 bounds gives a cheap `<svg>`. Needs `describeDefs` mounted into the thumbnail's `<defs>`, because gradients and shadows need them.
18. No file cards UI exists. The shell has only the `<select>` picker.

New diagram:
19. Nothing creates a document or file. Needs a pure `emptyDocument()`, a "next unused name" function over `storage.list()` (`workspace.ts`, which already has `workspaceFiles` and `FILE_EXTENSION`), a `writeText`, and then `shell.open`. Drafts and recents have no storage or folder convention in code. `StorageAdapter.write` already creates folders.
20. The shell's file list is read once at start (`shell.ts:470`). There is no refresh after creating a file.

Live-canvas dependencies to watch:
- The pointer-landing position of a paste needs `screenToWorld(view, pt)` from `view/view.ts`.
- `View` lives in the shell's closure.
- `redraw` and `refresh` are shell-private. `attachEditInput` shows the pattern, a `host` object with `getFile`, `measurer` and `refresh`.


---

# Model, commands and renderer inventory: Corrected report, after reading decisions.md and the spec in full

## (1) What I read in full
- docs/decisions.md, every row: D1-D12, F1-F28, A1-A33, E1-E83 (all, including E65-E83), Q1-Q21, L1-L3, O1-O5.
- Spec: sections 4.1-4.7 (the whole of section 4), 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 7.1-7.3, 9.
- docs/ui-mockups.html: the note text of every state. Those are First run, Projects, Project, Opened folder, Drafts, New project, Delete, Delete (no trash), Import, Import refused, New diagram, Rename, Move to project, Unsaved work, Folder browser, Editor, Toolbar moved, Panel resize, Narrow canvas, Very narrow canvas, Panels hidden, Another tab, Changed on disk, Export, Export too large, Preferences, Shortcuts, Command palette. I read the notes as text extracted from the HTML, not the rendered layouts.

## (2) Corrected section 10: gaps by decision
For each decision: what exists, what is missing, and the module it would touch.

**Format and model**
- **F1, F3, F19 (KDL, canonical writer, unknown content).**
  - Exists: `readDiagram` and `writeDiagram` (`kdl/read.ts:333`, `kdl/write.ts:159`).
  - Missing: a subset writer, which is a document built from the selection plus its classes. There is also no "is this a DrawIt document" test. `readDiagram` accepts any valid KDL and turns unknown nodes into `UnknownElement`s. E66 needs a rule that rejects non-DrawIt text, such as "has a `diagram` header". This is the only reliable way to ignore non-DrawIt text.
  - Touches: a new module under `edit/` or `kdl/`, and `kdl/read.ts` for the test.
- **F2, F5, F7 (flat file, z-order is layout order, no groups).**
  - Exists: `stackOrder` in `render/boxes.ts`.
  - Missing: paste must append pasted entries to the end of layout in source z-order, so they land on top. `duplicateCommand` does the same by iterating `doc.elements`. That is document order, not z-order, so relative stacking among copies can be lost. A subset writer should keep layout order.
  - Touches: the paste builder and `edit/duplicate.ts`.
- **F9, F23, E28 (tokens, classes, overrides).**
  - Exists: `StyleClass`, `ElementStyle`, and `style/of.ts` resolution.
  - Missing: copying element `el` overrides across files. Duplicate already re-issues these via `setStyle {kind:"el"}`. A pasted class carries `$token` references, and tokens live in `style.theme`. Per F23, a well-known token falls back to the built-in theme and any other token leaves the property unset. So a cross-file paste can change appearance silently if the target theme differs.
  - Touches: the clipboard builder and `style/of.ts`.
- **F10, A25, A26 (assets).** See answer (a). The `src` text travels but the file bytes cannot.
  - Touches: `images/path.ts`, `images/add.ts`, `images/store.ts`.
- **F12, F10 (bundled fonts, spec 4.4 "exports embed the fonts they use").**
  - Exists: woff2 per family, script, weight and italic (`text/fonts.ts`, 36 faces, with a comment about SVG embedding).
  - Missing: detection of the fonts a document uses, and base64 `@font-face` generation for the SVG.
  - Touches: `text/fonts.ts` and a new export module.
- **F20, 5.3 last bullet (free ends).**
  - Exists: `remove` in `commands/command.ts:131` and `deleteCommand` free ends at the deleted element's centre or the routed point. `duplicateCommand` handles one-end-copied edges with shifted free points.
  - Missing:
    - The model has `fromPoint` and `toPoint` plus `via` and absolute coordinates, so paste must translate all of them.
    - 5.7 says the free end is "moved along with the pasted elements". Duplicate shifts it by the offset, which matches. Paste to the pointer needs a different delta.
    - The one-end-copied edge needs the routed path of the source document, via `routedEdges` on the source.
  - Touches: the paste builder, `connectors/edges.ts`.
  - Note: `remove` in `command.ts` places a freed end at the centre of the element, while `deleteCommand` places it at the drawn end. This differs from the F20 text, "where they were", but cut uses `deleteCommand`, which is correct.
- **F21, F18 (hand edits, no layout).**
  - Exists: `placeUnplaced` in `render/place.ts`.
  - Missing: a pasted document from a hand-edited or AI-written clipboard may lack layout. Paste must run placement or reject.
  - Touches: the paste builder.
- **F22, F28 (defaults, fill none).** Defaults come from `style/defaults.ts`. They are relevant to export only in that the export needs `paper` for a non-transparent background.
- **F24-F26 (dash, gradient, shadow).** `render/defs.ts`.

**Renderer and architecture**
- **A2, A8 (own SVG renderer, SVG text with own line-breaking).**
  - Exists: `describeDiagram` returns pure `SvgNode[]`. Text is `tspan` lines laid out by `text/wrap.ts`.
  - Missing: an SVG-root builder (`viewBox`, `width`, `height`, `title`, `desc`, `defs`, `style`) and a string serialiser.
  - Touches: a new `render/export.ts`.
  - A8 rejected `foreignObject`, so the text is already export-safe.
  - Measurement needs a canvas 2D context and loaded fonts. This holds for export in the shell. For a thumbnail of a file not yet rendered it holds only after `loadFonts`.
- **A19 (unknown shapes).** Placeholders already export. Unknown elements (`kind: "unknown"`) are not drawn at all. They are skipped in `describeDiagram` and `isDrawn`, so they do not appear in an export and are excluded from bounds.
- **A20, A21 (stretch and outline caches).** `shapes/pack-loader.ts` caches per name and size, so export and thumbnails reuse the stretched shapes.
- **A24 (shadow cost; "export reads the same nodes").**
  - Exists: `describeDefs(doc)` is cached by `doc.style` and `doc.elements` identity. It covers the whole document, and the comment in `render/defs.ts` says an export can take the same nodes. `DescribeOptions.plain` drops filters during drags.
  - Missing: a subset variant for a selection or frame export, which would include unused defs. They are harmless but enlarge the file. Export must render with `plain` off, and a thumbnail should decide.
  - Touches: `render/defs.ts`.
- **A26 (image loading).**
  - Exists: the blob URL is the only form (`ImageStore`), and CSP is `img-src 'self' blob:`. A26 rejected `data:` URLs for the on-screen canvas. For export, inlining is required by spec 5.8 and Q18, but a `data:` URL is neither created nor allowed by CSP anywhere today. An SVG exported then rasterised via `<img>` may need `data:` to be allowed by CSP, or the PNG path must use a blob URL for the SVG and data URIs inside it.
  - Missing: a byte-reading `ImageLookup` that returns data URIs, and an async await-all step. `ImageStore` keeps the URL, not the bytes.
  - Touches: `images/store.ts` or a new lookup, and the server CSP (`web` index or Go server, which I did not inspect).
  - The decision to review: whether CSP needs `data:` for the PNG pipeline. Q18 calls for a spike.
- **A3, 5.5 (undo; "a drag, multi-selection move or paste is one step").**
  - Exists: `History.execute(cmd, {selection})`, with selection before and after restored by undo and redo. The `BatchCommand` doc comment names a paste.
  - Missing: nothing in History. Paste and cut need a new builder only.
- **A12 (serialisable commands).** All current commands are plain data, so a paste command must stay data. A pasted element carries `comments` and `ext`. Duplicate strips `comments`. A paste from KDL would carry them unless stripped.
- **A14, A32, E44, E46 (preferences and recent files), A27, A28, E52-E55, E74-E76 (library, folder browser, drafts, import, naming).**
  - Exists: nothing in `web/src`. Only `storage/adapter.ts` (`list`, `read`, `write`, `watch`; `FileInfo.modified`) and the picker `<select>` in `app/shell.ts`.
  - Missing for the target features:
    - a pure empty-document constructor, the "Untitled" naming for Drafts (E53), and the E74 rule "refuse a name that exists";
    - project name validation (E76);
    - a `Drafts` project creation call, which is a server (A28) operation I did not inspect.
  - Touches: `app/workspace.ts` for naming, the storage adapter for folder creation, and `storage/http.ts`.
  - The adapter has no create-without-overwrite call. `write` overwrites silently, so "name exists, refuse" needs `list()` first (race-prone), or a new adapter option.
- **A30 (modified-time polling).** Same `modified` value the thumbnail cache key needs. `FileInfo.modified` already exists.
- **A25 (32 MiB write limit).** `assertFitsLimit` exists. E58 "too large" thumbnail needs a read-size threshold (the file size is in `list()`). The product chooses the threshold; the docs name none.

**Clipboard**
- **E5, E65, E66, E67, E68, 5.7.**
  - Exists: no clipboard code. `edit/input.ts` has keydown only.
  - Missing:
    - `copy`, `cut` and `paste` listeners;
    - the guard `isTextEntry` (`app/text-entry.ts`);
    - the pointer position from `screenToWorld` (`view/view.ts`). The shell must expose the last pointer position and whether it is over the canvas, otherwise use the duplicate offset (`DUPLICATE_OFFSET = 16`);
    - cut as `batch [ , deleteCommand ]`. Locked elements are skipped by `deleteCommand`, so cut must also not copy-then-delete a locked element, or the semantics diverge (copy includes it, delete does not);
    - non-DrawIt text ignored.
  - Touches: `edit/input.ts`, a new `edit/clipboard.ts`, `app/shell.ts`.

**Export and thumbnails**
- **E48, E49, E50, 5.8 and Q18, E69.** See answer (c) for bounds. Frame export "everything overlapping the region, clipped" needs:
  - an overlap test for edges (the routed polyline) and for boxes;
  - an SVG `clipPath` or viewBox crop. Cropping with `viewBox` alone does not clip shadows that extend beyond the frame, and the frame name sits above the box.
  - Touches: a new export module, `connectors/edges.ts`.
  - Everything else (PNG, canvas size limits, download, `title`/`desc`) is missing. See my first report, items 7-14.
- **E56, E57, E58 (thumbnails).**
  - Exists: the lazy `IntersectionObserver` + `mount` pattern in `library/sidebar.ts`, and `describePreview`.
  - Missing:
    - a path+modified cache;
    - a parse-only read that does not create an `OpenFile` and `History`;
    - a per-file `images` lookup (`openImages` is a single global, so a thumbnail of another file would resolve its images against the open file's base);
    - the invalid-file hover with the parse error. `KdlSyntaxError` already carries line and column;
    - the "still rendering" state;
    - the project card thumbnail (most recently changed diagram, by `modified`).
  - Touches: `app/workspace.ts` (parse without opening), `render/images.ts`, a new thumbnail module.

## (3) Changes to sections 1-9
- Section 4 (`kdl/write.ts`): `writeDiagram` always writes the entire `style` (theme tokens included). A clipboard writer would emit the source theme unless it is trimmed, which contradicts "only the selection and the classes it needs" (E65). It writes `plugins` too.
- Section 2: `duplicateCommand` copies `class` by name only, never the class definition. So it cannot be reused unchanged for cross-file paste.
- Section 4: `documentBounds` is narrower than E50 requires. See (c).
- Section 7: the spec's 7.1 budgets include open of 500 elements in under 1 s and save in under 200 ms. No test in `e2e/` measures open or save. `OpenFile.dirty` re-serialises the whole document on each call to compare text, and `refresh` in `app/shell.ts` calls it each time. Autosave (E1) and paste would run it more often.
- Section 8: recents and project listing do not exist (A32/E44).
- Section 9: Q6/Q17 say a phase that changes what is drawn ends with a performance check ticket on the 500-element file. The existing `@budget` tests measure drags and resizes only, so an export or thumbnail run during drag is untested.

## Answers
**(a) Pasted image under `assets/`, target in a different folder.** The clipboard text carries only `src="assets/logo.svg"`, relative to the source diagram. In the target, `resolveAsset(targetPath, src)` resolves against the target file's folder (`images/path.ts`, which accepts only relative image paths that stay inside the workspace). If that file is missing there, `ImageStore.#load` fails and the element draws as a failed placeholder (`describe.ts`, the `image` case). The docs name no behaviour here. E65 and 5.7 never mention assets. A paste would need, at minimum, one of two things:
- the bytes, which the text cannot carry, so a read of the source file through the storage adapter at copy time, kept beside the text in session memory; or
- a copy of the file into the target's `assets/`, with a name that does not clash. `assetFileName(original, type, taken)` in `images/add.ts` already makes unique names, and `storage.write` creates the file.

The `src` would then be rewritten, and the paste would no longer be a pure `Command` (A12), because it writes a file. If the source and the target share a workspace folder, nothing needs copying when the relative paths agree. Decide whether paste writes files before the paste step (rule: only the clipboard text crosses files).

**(b) Class name exists in the target with a different definition.**
- Today: nothing exists. The design is silent. Spec 5.7 and E65 say only "classes used by pasted elements are copied into the target file if missing". No F-row, E-row or spec text says what a clash does. F9 and E28 cover only that classes come from files.
- The tempting implementation is wrong. `setStyle` with `{kind:"class"}` (`commands/command.ts:186`) creates the class if absent and otherwise `Object.assign`s the pasted properties onto the target's class. A paste would then silently restyle every existing element of that class in the target. The "if missing" wording says to keep the target's definition and leave pasted elements to take it. That is what simply not issuing the command does, and the pasted elements would change look.
- It needs a product decision, per the file's own rule: keep target definition (matches "if missing"), rename the incoming class (for example `accent-2`, which then needs the `class=` rewritten), or ask.

**(c) What `documentBounds` leaves out.** (`view/view.ts`, via `drawnBoxes` in `render/boxes.ts`.) It takes only the layout rectangle of elements that `isDrawn` accepts: node, shape, text, frame, image, with a layout entry. It leaves out:
- edges entirely: the routed path, free ends and `via` points outside the boxes, and the arrowheads and dots;
- edge labels and their background padding (`LABEL_PAD = 4`);
- stroke width for every element, including boxes (half the width extends past the rectangle);
- shadow extent (the filter region is 200%, with blur and offset);
- frame names, drawn one `lineHeight` above the frame (`render/frame.ts`);
- unknown elements, and any element without a layout entry;
- the E50 16 px padding (not added; `zoomToFit` takes its own margin).

For the same reason it cannot serve a thumbnail's viewBox. A diagram of mostly free-floating edges has null bounds.


---

# Ticket audit against the new design: Report

AUDIT OF docs/tickets.md (T-001 to T-083) AGAINST THE NEW DESIGN. Read-only. I read all four files in full and checked ui-mockups/tokens.css for tile sizes. Where I am unsure I say so.

## Per-ticket table
Rows group tickets that share a class. "Change needed" is a one-line action.

| ID | Title | Class | Evidence | Change needed |
|---|---|---|---|---|
| T-001, T-002, T-005, T-007, T-008, T-009, T-017, T-018, T-022 | Scaffold, model types, golden tests, generator, spikes, shape standard | UNAFFECTED | Nothing in E43-E83, A27-A33, Q15-Q20 or spec 5.1-5.8 touches them. | None. T-007 is also reused by the phase 9 budgets (spec 7.1). |
| T-003 | KDL v2 reader | BUILT ON | "Parse a `.drawit.kdl` file into the model"; E65 and spec 5.7: the clipboard is a complete `.drawit.kdl` read by "the same reader". Import (E55, spec 5.6) also refuses on a parse failure. | None. Clipboard paste and Import reuse the reader. |
| T-004 | Canonical writer | BUILT ON | E65: "The same reader, writer and formatter handle it". | None. Clipboard copy and Import rely on it. |
| T-006 | Command layer and undo | BUILT ON | E68 cut is "one undoable command"; E3 reload is an undoable command; spec 5.5 "History belongs to the open file and lasts until the file is closed". | Phase 7 and 6 add paste, cut and reload commands. History must reset on close (E43). |
| T-010 | Storage adapter interface | WORDING CONFLICT | "list, read, atomic write and watch within a workspace folder". A30 rejects "A file-system watcher streaming events to the app, a WebSocket". The app polls the modified time about once a second and compares a content hash. | Reword "watch" as modified-time and hash polling. The interface needs a stat call, and also library, folder-browser and preferences operations. |
| T-012 | SVG renderer: basic elements | BUILT ON | A24: "export reads the same nodes"; E49: export is "built from the model at its own size"; E58: thumbnails are "Rendered by the app's own renderer". | None. It must render off-screen for export and thumbnails. |
| T-013 | Pan and zoom | BUILT ON (some gaps) | "trackpad and mouse pan, pinch and keyboard zoom, zoom to fit". E78 adds a hand tool and Space-hold pan, and says the trackpad "pans as before". Spec 2.1 lists "zoom to selection". | Add the hand tool, Space-hold pan and zoom to selection. I could not tell whether mouse pan already uses Space. |
| T-014 | Selection | BUILT ON | E50: "a selection exports its elements". E65: the clipboard holds "only the selection". | None. The hand tool must suppress selection. |
| T-015 | Move and resize | BUILT ON | Spec 5.1: the right panel has "position, size". Those fields need move and resize commands. | None. The panel fields come later. |
| T-016 | Open, save and invalid files | BEHAVIOUR CHANGES and WORDING CONFLICT | "Open a folder and file, explicit save with unsaved indicator". E1 and E51: autosave about 2 s after the last edit, "On in the library and off in an opened folder". E64: the save state sits in the file pill. E47 and spec 5.6: the workspace comes from the command line, then the last project or folder, then the start screen. E43: one file at a time, and closing returns to the landing page. | Reword it. Add autosave, the Saving/Saved/Not saved state in the file pill, the E75 Save/Discard/Cancel dialog, the beforeunload warning, and the E3 conflict prompt. |
| T-019 | Go server: files | WORDING CONFLICT and BUILT ON | "confined to the opened folder with `os.Root`". Spec 6.2 and 5.6 now allow exceptions: the preferences file (A14), the library (A28), and folder-browser names (A27). Command-line choice (E47). | Reword the confinement. New endpoints needed: stat and hash, preferences, library create/rename/delete (trash), folder browser, import, and a one-session lock (A29). |
| T-020 | Server security | BUILT ON | A29: "The server has one session; a second tab ... can take over with Use here". Spec 6.2 adds `sessionStorage`. | Add the session ownership check on top of the token. |
| T-021 | HTTP storage adapter | WORDING CONFLICT | "inside the opened folder (A1)". A28: the server also reads and writes in the library folder. | Reword to "workspace". The library and preferences calls extend it. |
| T-023 | Grid and snap | WORDING CONFLICT and BEHAVIOUR CHANGES | "with toggles in the status bar". E80 and spec 5.1: a "status pill" at the top left, hideable (E79). A32: grid and snap settings are in the preferences file. Spec 5.1: View/Preferences toggles. | Move the toggles to the status pill. Persist the settings in preferences. When the pill is hidden (E82), the toggles stay reachable from View/Preferences. |
| T-024 | Bundled fonts | BUILT ON | "format ... can be embedded in SVG export later". Spec 5.8: SVG export has "used fonts embedded". Q18 spike. | None. Phase 7 consumes it. |
| T-025, T-026, T-027 | Text measurement, labels, overlay | UNAFFECTED, except T-027 | T-027: "Double-click ... to create a text box". The toolbar has a Text tool (E61). | T-027 is BUILT ON by the Text tool, which also arms creation. Otherwise none. |
| T-028 | Connector routing | UNAFFECTED | Spec 5.3 is unchanged. | None. |
| T-029 | Render edges | BUILT ON | Edges must render in export (E49, E50: "edges crossing a frame border still appear"). | None. |
| T-030 | Draw edges | BEHAVIOUR CHANGES (unsure) | "Line and arrow tool". E61 and spec 5.1: the toolbar has separate "line, arrow". Spec 5.3 and E14 name only "the line tool". F22: the default is `head-end` arrow. | Define how Line differs from Arrow (probably `head-end=none` for Line). Add the two toolbar buttons and the E71 palette action. |
| T-031, T-032, T-033, T-034, T-035 | Edge selection, re-attach, bends, labels, perf check | UNAFFECTED | No new feature touches them. | None. |
| T-036 | Style resolution | BUILT ON | Spec 5.7: "Classes used by pasted elements are copied into the target file". | None. It is used to find which classes a paste needs. |
| T-037 | Default theme and tokens | BUILT ON | Spec 4.4: "`paper` is the background behind edge labels". Export has a transparent option (spec 5.8). | None. |
| T-038, T-039, T-041, T-045, T-047, T-048, T-082 | Value parsing, registry, style commands, text and effect fields, perf check, hollow default | UNAFFECTED | The registry and commands are unchanged (E27, E28). | None. |
| T-040, T-044, T-046 | Render fill, text styles, effects | BUILT ON | A24: "export reads the same nodes". | None. T-046 already says export can reuse the nodes. |
| T-042 | Style panel: fill and stroke | BEHAVIOUR CHANGES | "Panel for the selection". E63: open by default. E81: edge drag resizes it, 180 to 360 px, default 200 px (spec 5.1). E79: it can be hidden. Spec 5.1: it also holds "position, size". | Add resize, default width 200, persisted visibility and width (A32), and position and size fields. |
| T-043 | Colour picker | BEHAVIOUR CHANGES | "Recent colours are kept for the session only". A32 and spec 5.1 store recent colours in the preferences file. E35: "for the session only until preferences exist". | Persist recent colours in preferences. |
| T-049, T-051, T-054 to T-066, T-068 | Pack loader, outlines, shape categories, perf check, anchors | UNAFFECTED | Not touched. | None. |
| T-050 | Render pack shapes | BUILT ON | Used for thumbnails (E58) and export. | None. |
| T-052 | Shape library sidebar | BEHAVIOUR CHANGES | "Left sidebar listing shapes by category ... lazily rendered previews". E62: "Each shape is a drawn tile with its name on hover" (tiles with a name under each were rejected). E61: the library "holds shapes only"; E63: open by default; E81: resizable, 180 to 360 px, default 224 px. | Tiles with a hover name, resizable and hideable panel, open by default. Rectangle and ellipse stay as built-in entries (E61, A22). |
| T-053 | Shape creation tool | BUILT ON | E61: the toolbar's rectangle and ellipse "arm like a shape (E31)". E71: palette actions. | None. |
| T-067 | Legible previews and details | WORDING CONFLICT | "Library previews are drawn at 72 by 52 px". tokens.css: `--tile-height: 44px`, `--tile-columns: 4`, `--icon-tile-w/h: 34/26`. E81 says tile size depends on panel width. | Reword to the tile size. Keep the part-size rules ("round part narrower than 6 px", "side under 8 px"). Check them at the tile size. |
| T-069 | Delete | BUILT ON | E68: "Cut: A copy followed by a delete, as one undoable command". | None. |
| T-070 | Duplicate | BUILT ON | E67: "offset from the originals as a duplicate is". E65, F20: free-end rule shared with paste. | None. Share the logic with paste. |
| T-072 | Align and distribute | UNAFFECTED | | None. |
| T-073 | Arrange panel | UNAFFECTED | The Arrange group is in the right panel (spec 5.1). | None. |
| T-074 | Lock and unlock | WORDING CONFLICT (unsure) | "The panel shows the lock state". Spec 5.2: "The style panel shows the lock state and can lock and unlock the selection". | Confirm a lock/unlock control exists. Add one if not. |
| T-075 | Select inside | BUILT ON | E71: it is a registered palette action. | None. |
| T-076 | Render frames | BUILT ON | E50: a frame exports "everything overlapping it, clipped to its region". | None. |
| T-077 | Frame tool | BUILT ON | E61: the toolbar has a frame button. | None. |
| T-078 | Binary files in storage | WORDING CONFLICT (minor) and BUILT ON | "inside the opened folder". Clipboard, Move to project and Import must carry images (see (a)). | Reword to "workspace". |
| T-079 | Render images | BUILT ON | Export embeds images (Q18). E58: thumbnails. | None. |
| T-080 | Add images | BUILT ON | "Paste or drop an image file onto the canvas". E66: "Text that is not a DrawIt document is ignored". The toolbar has an image button (E61). | The paste handler must dispatch three ways: KDL, image file, other text ignored. Define what the Image button does. |
| T-081 | Phase 5 perf check | UNAFFECTED | | None. |
| T-071 | Bring to front and send to back | UNAFFECTED | Phase 10 matches Q14 and spec 9. | None. |
| T-083 | Z-order buttons | UNAFFECTED | Q14 matches. | None. |

Coverage of the 82 tickets:
- UNAFFECTED: T-001, 002, 005, 007, 008, 009, 017, 018, 022, 025, 026, 028, 031 to 035, 038, 039, 041, 045, 047, 048, 049, 051, 054 to 066, 068, 071 to 073, 081, 082, 083.
- BUILT ON: T-003, 004, 006, 012, 013, 014, 015, 020, 024, 027, 029, 036, 037, 040, 044, 046, 050, 053, 069, 070, 075, 076, 077, 079, 080.
- WORDING CONFLICT: T-010, 019, 021, 023, 067, 074, 078. T-023 also needs a behaviour change.
- BEHAVIOUR CHANGES: T-016, 030, 042, 043, 052.

## (a) Decisions or spec statements that no ticket and no phase 6 to 10 goal line covers
The phase goal lines are one-liners. The items below are named nowhere:
1. Hand tool, Space-hold pan, zoom to selection (E78, spec 2.1, 5.1). Phase 6 names "the floating toolbar" but not the tools. T-013 has zoom to fit only.
2. Toolbar features. Each is outside any ticket: the Text tool and the Image tool (what it does is undefined), a Line versus Arrow distinction (E61), grip move, double-click reset and the stored offset (E77), and hiding the toolbar (E79, covered only loosely by the phase 8 "View toggles").
3. Panel resize and responsiveness (E81, E83, spec 5.1): 180 to 360 px, a 480 px canvas minimum, double-click default, shrinking panels. Also the status pill fit rule (E82), and the 224 and 200 px defaults. Phase 6 says only "panels open by default and the status pill".
4. Right panel "position, size" fields (spec 5.1). No ticket.
5. A lock/unlock control (spec 5.2). Unsure about T-074.
6. Second-tab notice and Use here (A29, spec 5.6, mockup "Another tab"). Not in any goal line.
7. Card thumbnails (E56, E57, E58, spec 5.6): a project card shows its latest diagram; invalid, too-large and still-drawing states. The "too large" threshold is not defined anywhere. Not named in phase 6.
8. Card actions menu (E59), Move to project (E53, mockup), the New project and New diagram dialogs (E74, E76), and the unsaved-work dialog (E75).
9. Browser leave warning (E75) and the "Changed on disk" notice (E3). "File watching" covers only part of this.
10. Opening order including the command-line argument (E47, E70).
11. Persisting grid, snap, panel and toolbar state, last project and recent files per folder (A32), and the A33 rule that an unreadable preferences file is left alone and unknown keys are kept. Phase 6 says "the preferences file". Unsure how much that covers.
12. Image assets across files. These all have no owner: (i) clipboard copy and paste across files carries `src="assets/..."` while E65 says the clipboard has "only the selection and the classes it needs"; (ii) Move to project (E53) of a draft whose images live in the shared `Drafts/assets/`; (iii) Import of a file whose `assets/` files are not selected (E55).
13. Draft naming when "Untitled" already exists. E53 says "a draft named Untitled"; the mockup shows "Untitled 2" (rule undefined). Diagram name character rules are defined only for projects (E76).
14. Spec 4.3 "Renaming an ID in the app updates all three sections". No ticket and no UI.
15. Spec 4.1(6) "the app migrates older versions forward" and F11's "dropped with a warning" for comments. I could not find a ticket. Unsure; T-004 may cover the warning.
16. Accessibility "Every action is reachable from the keyboard" (spec 7.2). Probably phase 8 but not stated.
17. Export UI details. Phase 7 names "clipboard and export" and the spike. The dialog, preview, scope picker (E50), transparent background, the too-large refusal (E69) and the filename (E48) are not itemised.

## (b) Contradictions between decisions, spec and mockup
1. **Start screen lists "Recent" diagrams across projects.** Mockup "Projects": "Recent diagrams below" (cards network, checkout-flow, pitch-arch, Untitled 2 from four projects). E46: "Kept per folder ... the landing page shows the opened folder's", with "Recent files across all folders" rejected. A32: "the recent files of each folder". Spec 5.6: "The start screen shows projects, and the landing page shows diagrams". Either E46 and spec or the mockup are stale.
2. **The server serves one workspace, but the start screen reads all projects.** A28: "serves one project or opened folder at a time". Spec 5.6 and 6.2: reads and writes stay in the folder, the library exception being "creating, renaming and deleting", and the folder browser "never reads a file". Yet the start screen needs each project's diagram count, modification dates and thumbnails (E57, E58). Import into a chosen project and Move to project also cross projects. The exception list must include reading and moving across the library, and A28's "one at a time" needs a rider.
3. **Drawing state in the mockup versus E58.** E58: a file that is "still rendering shows a file icon and its name". Mockup "Project", second card: text "Drawing...", no icon. Also E58 says the parse error is shown "on hover", but the mockup prints "Can't open: line 12, column 5" in the card face. The note says "on hover".
4. **Move to project.** E59 lists "rename, delete and move to project" for the card menu. The mockup Drafts note says "Its card menu adds Move to project" (implying only Drafts), while the "Project" screen's menu also shows it. Project cards in the mockup have no Move.
5. **E61 versus its own rejection.** "the library holds shapes only, with rectangle and ellipse also kept there as built-in entries" while "tools in both places" is rejected and the Why says "one home per control". Rectangle and ellipse are in both places, so the wording contradicts itself. A22 and spec 3 keep the entries.
6. **E1 versus E51.** E1: "autosave writes the open file about two seconds after the last edit" (unqualified). E51: "On in the library and off in an opened folder". E1's Rejected column lists "Autosave only, explicit save only", which still reads as autosave everywhere.
7. **E35 versus A32.** E35: "Kept for the session only until preferences exist". A32 and spec 5.1 list recent colours in preferences. E35 is a status phrase and should say recent colours are kept in preferences. Related: T-026 "until styling arrives" is also a status word.
8. **Terminology.** The names Home, start screen, landing page and Projects vary. The mockup labels the same screen "Home" in its group, "Projects" in its title and "‹ Home" in the opened-folder breadcrumb, but "‹ Projects" for projects. The file pill "Home" (E64) returns to "the landing page" (E43 "closing it returns to the landing page"). For a library project that is the project's page, not the start screen. Define which one Home goes to.
9. **Header bar.** The mockup has a "DrawIt" bar with Import and Open folder across Home screens (tokens.css `--header-*`). Spec and decisions do not mention it, while E64 rejects "a toolbar across the top" for the editor. Spec 5.6 says the start screen "has an Open folder button". Unsure whether the bar is wanted.
10. **Line versus arrow tool.** Spec 5.3 and E14 say "the line tool", but E61 and the mockup toolbar have line and arrow.
11. **Panel defaults.** Spec 5.1 gives 224 and 200 px. E81 says only "restores the default". The mockup uses 300 px as a demo width, and the tokens file holds 224 and 200 (consistent). No decision row carries the numbers.
12. **Q5 and Q14 versus phase 10.** Q5 says stacking order commands "follow in v1.1". Q14 and the Phase table say phase 10, "After v1". Consistent only if v1.1 equals phase 10.
13. **Spec 2 versus 5.2 on locking.** Spec 5.2 says the panel can lock and unlock. T-074 says the panel shows the lock state.
14. **Spec 2.1.** Lists zoom to selection; no other text or ticket mentions it.

## (c) Tickets that mention behaviour of a UI element the new design removes or relocates
- **T-023** names the "status bar". The target is a status pill at the top left (E80), hideable (E79).
- **T-016** says "explicit save with unsaved indicator". Autosave exists (E1, E51), and the save state lives in the file pill (E64). It also implies opening a folder directly with no start screen or landing page (E43, E47, E70).
- **T-043** says "Recent colours are kept for the session only". Recent colours go to preferences (A32).
- **T-052** describes a sidebar with "lazily rendered previews" of shapes. It becomes a resizable, hideable panel of tiles with the name on hover (E61, E62, E63, E81).
- **T-067** says "72 by 52 px" previews. The mockup tile is 44 px high, 4 columns (tokens.css).
- **T-030** has one "Line and arrow tool". The toolbar has Line and Arrow as separate buttons (E61).
- **T-010, T-019, T-021, T-078** say "opened folder" or "within a workspace folder". The library, preferences and folder-browser exceptions (A14, A27, A28) apply. T-010's "watch" meets A30's rejection of watcher events.
- **T-042, T-073, T-074, T-083** place controls in "the panel" or "the right panel". Spec 5.1 lists the right panel as properties of the selection (fill, stroke, text, arrange, position, size), hideable (E79) and resizable (E81). Their behaviour is intact, but their location becomes optional and resizable.
- **No ticket mentions a "top bar".** The only top-bar references are the Home header in the mockup and the E64 rejection.
