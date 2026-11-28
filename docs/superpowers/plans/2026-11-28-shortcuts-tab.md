# Shortcuts Tab Groups and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the Preferences Shortcuts tab from the action table with Tools / Editing / View / Files groups, key labels or "Not set", and search by name or key.

**Architecture:** Each `Action` carries a `group`. Pure helpers group and filter the list for display; the Shortcuts panel renders that result and refilters on input. Recording and Reset/Clear stay out of scope.

**Tech Stack:** TypeScript, Vitest, Playwright, existing `keyLabel` and Preferences dialog.

**Spec:** `docs/superpowers/specs/2026-11-28-shortcuts-tab-design.md`

## Global Constraints

- Code never mentions tickets, decisions, spec sections or project status (CLAUDE.md)
- Test-first: failing test, then code
- No Reset, Clear, recording, or Reset all in this plan
- Search placeholder text: `Search actions or keys`
- Missing key copy: `Not set`
- Group headings: `Tools`, `Editing`, `View`, `Files`
- Docs describe current state only; mark T-139 `done` when tests pass

## Review Focus

- Query matching is case-insensitive on both title and key label
- A group with no matching rows is omitted from the filtered result
- An action whose `key` is undefined shows `Not set`, not an empty string
- Mac vs non-Mac labels come from the `mac` flag passed into the helpers (same as tooltips)
- The shell passes the live `editorActions` list into Preferences so the tab cannot drift from the dispatcher

---

### Task 1: Action group field and listing helpers

**Files:**
- Modify: `web/src/app/actions.ts`
- Create: `web/src/app/shortcut-list.ts`
- Modify: `web/src/app/actions.test.ts`
- Create: `web/src/app/shortcut-list.test.ts`

**Interfaces:**
- Consumes: `Action`, `ActionKey` from `actions.ts`; `keyLabel` from `key-label.ts`
- Produces:
  - `ActionGroup = "tools" | "editing" | "view" | "files"`
  - `Action.group: ActionGroup` (required on every action)
  - `ShortcutRow = { id: string; title: string; key: string }` (`key` is the display string, or `"Not set"`)
  - `ShortcutGroup = { id: ActionGroup; title: string; rows: ShortcutRow[] }`
  - `shortcutList(actions: readonly Action[], mac: boolean): ShortcutGroup[]`
  - `filterShortcutList(groups: readonly ShortcutGroup[], query: string): ShortcutGroup[]`

- [ ] **Step 1: Write the failing tests**

In `shortcut-list.test.ts`:

```typescript
it("groups actions in Tools, Editing, View and Files order", () => {
  // build a small Action[] covering all four groups; assert shortcutList titles and row ids
});

it("shows Not set when an action has no key", () => {
  // action with group and no key → row.key === "Not set"
});

it("filters by action title or key across groups and drops empty groups", () => {
  // query "zoom" keeps View rows whose title or key match; Tools empty → omitted
});

it("adds a new table action into its group with no other change", () => {
  // take editorActions(host()), append { id: "demo", title: "Demo action", group: "editing", enabled, run }
  // shortcutList includes Demo action under Editing
});
```

In `actions.test.ts`, extend the existing id/title assertions so each listed action’s `group` matches: tools for `tool-*`, editing for undo/redo, view for grid/snap/zoom-*/toggle-*, files for save/preferences.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm test -- src/app/shortcut-list.test.ts src/app/actions.test.ts`

Expected: FAIL (module or `group` missing)

- [ ] **Step 3: Implement group field and helpers**

Add `group` to `Action` and set it on every entry in `editorActions`. Implement `shortcutList` (stable group order, only groups that have rows, keys via `keyLabel`) and `filterShortcutList` (trim, case-insensitive substring on `title` and `key`, drop empty groups).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npm test -- src/app/shortcut-list.test.ts src/app/actions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/app/actions.ts web/src/app/actions.test.ts web/src/app/shortcut-list.ts web/src/app/shortcut-list.test.ts
git commit -m "$(cat <<'EOF'
Add action groups and shortcut list helpers for Preferences.

EOF
)"
```

---

### Task 2: Shortcuts panel UI and wire-up

**Files:**
- Modify: `web/src/app/preferences.ts`
- Modify: `web/src/app/shell.ts` (pass actions into `openPreferences`)
- Modify: `web/src/app/app.css` (`.kr`, `.k`, search field, muted Not set — mirror mockup)
- Modify: `web/e2e/preferences.spec.ts`
- Modify: `docs/tickets.md` (T-139 → `done`, Updated on today)

**Interfaces:**
- Consumes: `shortcutList`, `filterShortcutList`, `Action` from Task 1; `keyLabel` platform detection already used in shell for tooltips
- Produces:
  - `openPreferences(..., actions: readonly Action[], mac: boolean): Promise<void>`
  - Shortcuts tab content built inside `build` when the tab is Shortcuts

- [ ] **Step 1: Write the failing e2e tests**

In `preferences.spec.ts`:

```typescript
test("Shortcuts lists grouped actions and Not set for key-less ones", async ({ page }) => {
  // open Preferences → Shortcuts
  // expect headings Tools, Editing, View, Files
  // expect Select with its key label; Preferences… shows Not set
});

test("Shortcuts search filters by name or key", async ({ page }) => {
  // type "zoom" into the search box
  // expect Zoom rows visible; Tools heading gone; Select gone
});
```

- [ ] **Step 2: Run e2e to verify they fail**

Run: `cd web && npx playwright test e2e/preferences.spec.ts -g 'Shortcuts lists|Shortcuts search'`

Expected: FAIL (empty Shortcuts panel / missing search)

- [ ] **Step 3: Implement the panel and wire-up**

Build the Shortcuts panel: search `<input class="f" placeholder="Search actions or keys">`, then render groups/rows from `shortcutList` / `filterShortcutList` on input. Row: action title + `.k` (add `.muted` when Not set). Extend `openPreferences` / `build` with `actions` and `mac`; update `showPreferences` in `shell.ts` to pass the current actions list and the same mac flag tooltips use. Port minimal `.kr` / `.k` / `.muted` styles into `app.css`. Mark T-139 done in `docs/tickets.md`.

- [ ] **Step 4: Run e2e and unit tests**

Run: `cd web && npm test -- src/app/shortcut-list.test.ts src/app/actions.test.ts && npx playwright test e2e/preferences.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/app/preferences.ts web/src/app/shell.ts web/src/app/app.css web/e2e/preferences.spec.ts docs/tickets.md
git commit -m "$(cat <<'EOF'
Show grouped searchable shortcuts in Preferences.

EOF
)"
```
