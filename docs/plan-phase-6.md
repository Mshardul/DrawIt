# DrawIt — Plan for phase 6

Build order and scope for the workspace, the editor frame and the action table. The spec says what DrawIt does, `decisions.md` records each design choice and `tickets.md` holds the work; this file does not repeat them. The screens are in `ui-mockups.html`.

## Phase 6: workspace and editor frame

**Outcome:** an author starts DrawIt on a start screen, opens or creates a project or a folder, draws in an editor with a floating toolbar, a file pill and a status pill, and the work is saved without thinking about it. Files changed outside DrawIt reload or ask. The editor never opens a file by itself.

**Out of scope**
- Clipboard and export: phase 7.
- The command palette, rebinding, the Preferences dialog and hiding the panels, toolbar and status pill: phase 9. Phase 6 keeps a visibility flag for each and nothing that hides them.
- Several open diagrams in tabs or windows, visual diff and bundles (v1.1).
- Renaming an ID from the app, version migration and the accessibility sweep: phase 10.

**Build order**
1. Server core: preferences, the workspace holder, switching with a workspace id, the library listing, the one-session rule and the folder browser (T-084 to T-087, T-090, T-091). The library writes and trash follow (T-088, T-089).
2. Anything with no dependency on the server can start at once: diagram bounds, the start option and shared test helper, library tiles, position and size fields (T-095, T-096, T-114, T-117).
3. The adapter carries the new operations and polling (T-092 to T-094).
4. Navigation: the workspace object with a plain Home, then dialogs, the action table and the second-tab screen (T-097 to T-100). From here the app always opens on Home and never on a file.
5. Home screens: start screen, landing page, create dialogs, card menu, import and folder browser, thumbnails (T-101 to T-107).
6. Editor frame: the toolbar first, because it takes the tool buttons out of the top bar, then the file pill, which replaces the top bar, then autosave and the changed-on-disk dialogs (T-108 to T-113). Panels and the status pill follow (T-114 to T-118).
7. The performance check closes the phase (T-119).

**Rules for every ticket in this phase**
- The app stays runnable and every test passes after each ticket. A ticket that breaks an e2e spec moves it in the same ticket.
- A ticket names the done ticket whose delivered behaviour it changes. Done tickets are not edited (Q21).
