# DrawIt — Plan for phase 3

Build order and scope for styling. The spec says what DrawIt does, `decisions.md` records each design choice and `tickets.md` holds the work; this file does not repeat them.

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
