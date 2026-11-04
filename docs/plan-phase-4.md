# DrawIt — Plan for phase 4

Build order and scope for shape packs. The spec says what DrawIt does, `decisions.md` records each design choice and `tickets.md` holds the work; this file does not repeat them.

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
