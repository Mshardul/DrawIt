# DrawIt — Decisions

Why DrawIt works the way it does. The spec states what DrawIt does; this file records the reasoning and the alternatives that were rejected. Each row describes the current design only; when a decision changes, edit its row. History lives in git.

## Product

| # | Decision | Choice | Why | Rejected |
|---|---|---|---|---|
| D1 | Why build it | Own tool instead of draw.io | Diagram-as-code files and privacy; draw.io's format is not diff-friendly | Using draw.io as is |
| D2 | Authoring mode | Canvas-first | The canvas is primary; the text file is storage | Text-first (as in D2/Mermaid), true two-way editing |
| D3 | Positioning | Pixel control, stored in the file | Follows from canvas-first | Auto-layout only |
| D4 | Scope of content | Diagrams and infographics | Same canvas serves both; infographics need styling, text and images | Diagrams only |
| D5 | Platform | Local web app only, any desktop browser | OS-agnostic from day one; one codebase | macOS app first (Tauri), desktop wrapper now |
| D6 | Devices | Desktop browsers, mouse and keyboard | Tablets cannot run the local binary; touch is a large separate effort | Touch and tablet support in v1 |
| D7 | Language | English only in v1 | Text engine stays simple; Intl.Segmenter keeps the door open | Devanagari or right-to-left in v1 |
| D8 | Pages | One unlimited canvas per file, with frames | Simpler files and diffs; frames cover export regions and later slides | Multiple pages per file (draw.io style) |
| D9 | Audience | Author and colleagues first; public, open source from day one | Ships fast; collaboration happens through shared files | Private repo until v1 |
| D10 | Name | DrawIt, internal working name | Unblocks team and docs; every short name checked was taken or did not fit | Blocking on the final name |
| D11 | Vendor icons | Not bundled | AWS/GCP/Azure icon sets each have their own licence terms | Bundling vendor packs in v1 |
| D12 | Accounts and cloud sync | Never | Contradicts local-only and privacy; sharing happens through files and bundles | Hosted sync |

## File format

| # | Decision | Choice | Why | Rejected |
|---|---|---|---|---|
| F1 | Base syntax | KDL v2 with a DrawIt schema | Hand-writable, supports comments, no indentation or typing traps, existing parsers, no grammar to own | Custom DSL, YAML (ambiguity), TOML (poor nesting), JSON (noisy diffs, no comments) |
| F2 | Sections | Structure, style and layout in one file | Text edits, restyles and drags each change a different line; no sync drift | Separate layout sidecar file; two sections (structure + layout) |
| F3 | Formatter | App rewrites canonical form on every save | Stable bytes, clean diffs, hand edits normalised | Preserving arbitrary formatting |
| F4 | Source of truth | DrawIt's own document model | A rendering library's internal format never reaches disk, so libraries stay swappable | Persisting a library's state |
| F5 | Z-order | Implicit, from layout order; nodes and edges share one order; no layers | Avoids a `z=` on every element. A boundary behind its contents needs only send-to-back, which moves one layout line | Explicit `z=` property, named layers |
| F6 | Anchors | In layout, as visual properties | Anchors are presentation in v1 | Named ports in structure (open question O1) |
| F7 | Groups | None in v1: flat file, absolute coordinates | Nesting needs relative coordinates, membership rules and a diff for every node moved between groups. A boundary is a plain shape behind its content, and a select-inside command moves a container with its contents. A `group` node can be added later as new vocabulary (A11) | Nested groups, flat member lists |
| F8 | Rich text (after v1) | Markdown subset plus Pandoc spans, in core. v1 text boxes hold plain text with one style | Changes how every text box is read, so it cannot be a plugin; readable in diffs. Mixed styles in one box are the hardest part of the text engine, so they follow once plain text is proven | Plugin-provided rich text, HTML |
| F9 | Styling | Theme tokens, classes, per-element overrides | One theme switch restyles a file; text styling stays on-theme | Raw values everywhere |
| F10 | Assets | `assets/` folder, relative paths | Base64 embedding wrecks diffs | Embedding images in the file |
| F11 | Comments | Whole-line comments kept; others dropped with a warning | Covers the common case at small cost | Full comment preservation; no comments |
| F12 | Fonts | Three bundled OFL font families in v1 | Files and bundles render identically on every machine; weight and italic give emphasis without more families | System fonts, font CDNs |
| F13 | Themes | One default theme in v1 | Token system in the format means more themes need no format change | Multiple themes in v1 |
| F14 | Extension | `.drawit.kdl`, defined as one constant | Editors highlight KDL; DrawIt recognises its own files; the final name changes one constant | `.kdl`, custom extension |
| F15 | Text model | Shape and edge labels are plain text in one style; styled text lives in separate text boxes; class and ERD shapes have no compartments | Text boxes need the wrapping engine anyway, so dropping labels would save little. Labels keep `node api "API Gateway"` as one readable line and one element per box | Text only in separate boxes (two elements per shape, text does not follow its shape), rich-text labels, structured compartments |
| F16 | Style overrides | `el <id> …` prefix; IDs match `[a-z][a-z0-9_-]*` | Keywords and IDs would share one namespace in the style section, so an ID like `size` would be ambiguous and plugins adding keywords could break files. A leading keyword on every line avoids both | Reserved-word list, quoted IDs |
| F17 | Layout whitespace | Single space between fields, no column alignment | Alignment re-spaces every line when a longer ID or number appears, which makes noisy diffs | Aligned columns, fixed-width padding |
| F18 | Elements without layout | Shown as written; unplaced elements go in a grid in file order, then are written on save. In-app docs tell authors to write layout | Generated files stay usable without an auto-layout engine in v1 | Auto-layout in v1 (dagre, ELK), stacking at the origin |
| F19 | Unknown content | Kept losslessly in content, re-emitted in canonical KDL | The formatter rewrites the file, so byte-for-byte cannot be promised | Byte-for-byte preservation |
| F20 | Free edge ends | `-` in structure, the point in layout | An unattached end is a position, and positions live in layout, so dragging it edits one layout line. Deleting a shape frees its edge ends where they were; pasting an edge with one end copied does the same | Coordinates in structure, deleting edges with their shape |
| F21 | Hand edits | Only KDL syntax is checked on open | The app guarantees what it writes is valid; authors own the validity of hand edits. Diagnostics are a v2 candidate | Validating references and versions on open |

## Architecture

| # | Decision | Choice | Why | Rejected |
|---|---|---|---|---|
| A1 | Layers | Document model, commands, renderer, storage adapter | Model testable without UI; one path for every change; storage swappable | Library-owned state |
| A2 | Renderer | Own SVG renderer | Hundreds of elements fit SVG; crisp text; direct export; full control for freeform shapes | React Flow (node-graph assumptions), tldraw (licensing, inherited model), canvas/WebGL (unneeded at this scale) |
| A3 | Undo | Command layer with Immer patches, session-only history per file | Forward and inverse patches for free; git or the user's own backups cover long-term history | Persisted history |
| A4 | Local server | Go, single binary with `go:embed` | Author's core stack; one file per OS; cross-platform | Rust (only made sense alongside Tauri) |
| A5 | Why a server at all | Needed for save-in-place in every browser | Only Chromium supports writing back to local files; the server is the only storage backend | Chromium-only File System Access API |
| A6 | Server security | 127.0.0.1, session token in the URL fragment sent as a header, Host/Origin checks, strict CSP, no-referrer, folder confinement with `os.Root` | Other websites in the browser can otherwise reach a local server. A fragment never reaches a server or a Referer header; a cookie would go to every local service on the same host. `os.Root` stops symlinks leading out of the folder | Plain localhost server, token in the query string, token in a cookie |
| A7 | Workspace | Open a folder | Natural for multi-file work; limits what the server can touch | Single-file open |
| A8 | Text engine | SVG text, own line-breaking, plain editing overlay with identical measurement; ProseMirror once rich text arrives | Identical wrapping in editing and display. Plain text needs no editor framework | `foreignObject` (breaks PNG export in Safari), contenteditable alone |
| A9 | Plugins | In-house only; packs in v1, code extensions later | Simple now; sandbox-ready rules keep third-party plugins possible | Third-party plugins in v1 |
| A10 | Plugin rules | Import only `plugin-api`; return data, not DOM; change documents only via commands | Allows moving plugins into a sandboxed worker later without rewrites | Unrestricted in-process plugins |
| A11 | Format vs plugins | Plugins add vocabulary, never change existing syntax | The same file must mean the same thing on every setup | Plugins altering core syntax |
| A12 | Collaboration readiness | Commands are serializable and ID-addressed | Allows a CRDT later without a rewrite | Adopting a CRDT in v1 |
| A13 | Charts (after v1) | Hand-rolled SVG with d3 maths only | Charts follow the theme and export as drawn | Full chart libraries with their own styling |
| A14 | Preferences | One file in the OS user config directory, written by the server | Survives port changes and follows the author across workspaces and browsers. The only place outside the opened folder that DrawIt writes | `localStorage` (lost when the port changes), config inside each workspace |
| A15 | Shape stretch | Cut lines: parts outside keep their size, parts between scale; applied to SVG coordinates at load | Packs stay data-only, and one mechanism covers fixed corner radii, banner ends, callouts and plain scaling | Per-shape code, scale-only with distorted corners, 9-slice images |

## Editor behaviour

| # | Decision | Choice | Why | Rejected |
|---|---|---|---|---|
| E1 | Saving | Explicit save in v1 | Predictable writes | Autosave |
| E2 | Invalid files | Refuse files that fail KDL parsing, with line and column | Never open partially or overwrite hand edits | Opening the valid parts read-only |
| E3 | External changes | Reload as undoable command; ask if unsaved edits exist. Own saves recognised by content hash | Never merge silently. Canonical bytes make the hash exact | Silent overwrite or merge; ignoring events for a time window after a save |
| E4 | Moving related elements | Multi-select to move together; select-inside command for containers | Selecting a set and dragging it is one step, and nothing in the file records membership | Persistent groups |
| E5 | Clipboard format | KDL text | Pasting into a text editor shows the source | Private binary clipboard format |
| E6 | Interface | Minimal canvas, highly configurable | Clean canvas; power users tune shortcuts and panels | Dense docked panels (draw.io style) |
| E7 | Code view | v2 | Not needed to ship v1 | Code view in v1 |
| E8 | Visual diff (after v1) | Any two files in the workspace, in the UI | Files may not be in git; visual comparison is the need | git integration, `git difftool`, command-line diff |
| E9 | Sharing (after v1) | Export/import bundle (zip) | Others see the canvas exactly as intended | Sharing the bare file only |
| E10 | Sequence diagrams (after v1) | Shape pack plus attach-anywhere connectors; attach-anywhere is in v1 | Attach-anywhere is useful generally, so it lives in the core connector model | Sequence diagrams as a code extension |
| E11 | Creating text | Double-click empty canvas makes a text box; double-click a shape edits its label | Text is one gesture away | Toolbar-only text creation |
| E12 | Documentation | In-app reference for syntax, shapes and style properties | People and AI authors can check what a file should contain, since the app shows the file as written | External docs only |

## Quality, process and licensing

| # | Decision | Choice | Why | Rejected |
|---|---|---|---|---|
| Q1 | Performance target | Budgets at 500 elements, tested automatically | Matches "hundreds of elements" | No budgets |
| Q2 | Development | Test-first with AI; tests tagged by ticket ID; Playwright for browser behaviour | The test catalogue is the definition of done; text, drag and export behaviour only shows in real browsers | Writing tests after code |
| Q3 | Planning | Dependency-ordered phases, no dates | Work happens as time allows | Date-based schedule |
| Q4 | Tickets | One `tickets.md` table: ID, phase, title, description, depends on, status, created on, updated on | Lean enough to stay current; dependencies let agents pick valid work | One file per ticket |
| Q5 | v1 scope | The slice used daily: drawing, connectors, plain text, files, export. UML/ERD, sequence diagrams, visual diff, bundles, rotation, guides, rich text and copy style follow in v1.1 | A smaller v1 ships and can be used sooner, and the riskiest features build on a proven core | Everything in v1 |
| L1 | Licence | AGPL-3.0 | Derivatives stay open source, including hosted versions | MIT, GPL (hosted-service gap) |
| L2 | Contributions | No CLA | Simpler for contributors; the project stays AGPL permanently | CLA enabling relicensing |
| L3 | Templates, themes and shape packs | CC0 | Diagrams started from them carry no obligations, and exports embed shape art in users' files | AGPL for templates and shapes |

## Open questions

| # | Question | Status |
|---|---|---|
| O1 | Should named connection ports become a structure-level feature, and when? | Open |
| O2 | Should the diff detect renamed IDs by matching labels and properties? | Open; renames show as remove plus add when visual diff ships |
