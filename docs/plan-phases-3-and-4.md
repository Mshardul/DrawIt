# DrawIt — Plan for phases 3 and 4

Build order and scope for styling (phase 3) and shape packs (phase 4). The spec says what DrawIt does, `decisions.md` records each design choice and `tickets.md` holds the work; this file does not repeat them.

## Phase 3: styling

**Outcome:** a user restyles shapes, edges and text from a panel, and every style survives save and reopen. Styled files from hand edits or AI authors render correctly.

**Out of scope**
- UI to create or apply classes, and a theme editor: classes and themes come from files (E28).
- Multiple themes and dark mode (v2), rich text spans and copy style (v1.1).

**Build order**
1. Foundation: style resolution, default theme, value parsing, property registry (T-036 to T-039).
2. Fill and stroke end to end, with the shared commands, panel and colour picker (T-040 to T-043).
3. Text styles end to end (T-044, T-045).
4. Dash, gradient and shadow, then the performance check (T-046 to T-048).

## Phase 4: shape packs

**Outcome:** a user finds a shape in the sidebar, places it, resizes it and connects edges to its outline. All seven categories ship in the five packs.

**Out of scope:** user pack folders, enabling and disabling packs, pack version checks.

**Build order**
- The pack loader needs only the resolver (T-049).
- Pack rendering needs fill and stroke from phase 3 (T-050).
- Outlines come before attachment and elbow exits (T-051, T-062).
- The sidebar needs the loader and pack rendering, and the creation tool follows it (T-052, T-053).
- The performance check needs pack rendering and attachment (T-061).
- The contact sheet follows the app's role rules before any category review (T-063).
- The category tickets need the shape standard and the contact sheet, so they can start beside phase 3 (T-054 to T-060).
