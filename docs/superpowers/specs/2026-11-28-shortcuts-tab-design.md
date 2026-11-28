# Shortcuts tab: groups and search

**Status:** approved  
**Ticket:** T-139

## Intent

The Preferences Shortcuts tab lists every action from the action table so authors can browse and find keys. It is display and search only; recording, clear, reset and Reset all belong to later tickets.

## Why

E71 keeps one action table for palette and keys. E108 groups that table as tools, editing, view and files, with search by name or key. An action with no key shows "Not set".

## Goals

- Shortcuts tab built only from the action list passed in
- Four groups: Tools, Editing, View, Files
- Search filters across groups by action title or displayed key
- Empty groups hidden while filtering
- No key → "Not set"
- Adding an action with a group is enough for it to appear

## Non-goals

- Recording, conflict messages, Clear, Reset, Reset all (T-140, T-141)
- Preference overrides for keys (T-140)
- Keyboard and gestures read-only dialog (E99)

## Approaches

1. **Group field on each Action** — Chosen. Matches E71 and the "add an action, no other change" test.
2. Infer groups from id prefixes — Rejected; a new action without a matching prefix would be invisible or miscategorised.
3. Separate group registry beside the table — Rejected; drifts from the table (E71).

## Design

- Extend `Action` with `group: "tools" | "editing" | "view" | "files"`.
- Assign current actions: tools → tool actions; editing → undo, redo; view → grid, snap, zoom actions, layout toggles; files → save, preferences.
- Pure helpers turn the list into ordered groups of rows `{ title, key }` using `keyLabel`, and filter by a query against title and key string (case-insensitive).
- Shortcuts panel: search input (placeholder "Search actions or keys"), then group headings and rows matching the mockup (`.kr` / `.k`, muted "Not set"). No Reset/Clear controls.
- `openPreferences` takes the current `Action[]` and builds the Shortcuts panel from it; the shell passes `editorActions(...)`.
- Platform for labels: same Mac vs non-Mac rule `keyLabel` already uses at the call site.

## Left to the builder

Exact helper names, CSS token values ported from the mockup, and whether e2e covers search in addition to the unit test that adds an action.
